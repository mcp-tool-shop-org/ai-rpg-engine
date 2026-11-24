## verify_state_digest_vectors.gd — cross-language state digest vector and client behavior runner.
##
## Loads res://sidecar_client.gd, res://framing.gd, and res://state_digest_vectors.jsonl inside
## an imported Godot project, verifies canonical_json() and canonical_state_hash() on every vector,
## and exercises SidecarAttachClient digest_spec_version enforcement and staleness detection.
extends SceneTree

const SidecarClient := preload("res://sidecar_client.gd")
const Framing := preload("res://framing.gd")

const NATIVE_CHECK_COUNT := 5


func _init() -> void:
	var vectors_path := "res://state_digest_vectors.jsonl"
	if not FileAccess.file_exists(vectors_path):
		push_error("Vector file not found: " + vectors_path)
		quit(1)
		return

	var text := FileAccess.get_file_as_string(vectors_path)
	var lines := text.split("\n", false)
	if lines.is_empty():
		push_error("Vector file is empty: " + vectors_path)
		quit(1)
		return

	var passed := 0
	var failed := 0
	var non_blank_lines := 0
	for i in range(lines.size()):
		var raw_line := lines[i].strip_edges()
		if raw_line.is_empty():
			continue
		non_blank_lines += 1
		var parsed: Variant = JSON.parse_string(raw_line)
		if typeof(parsed) != TYPE_DICTIONARY:
			printerr("FAIL line=%d invalid JSON" % [i + 1])
			failed += 1
			continue

		var rec := parsed as Dictionary
		var vec_id := str(rec.get("id", "line_%d" % [i + 1]))
		if rec.has("expected_error"):
			var expected_error := str(rec["expected_error"])
			var raw_literal := str(rec.get("raw_json_literal", ""))
			if expected_error == "NUL_CHARACTER":
				# Godot 4 C++ String replaces U+0000 with U+FFFD, which is why the authority must refuse U+0000.
				var literal_parsed: Variant = JSON.parse_string(raw_literal)
				if typeof(literal_parsed) != TYPE_DICTIONARY or str(literal_parsed.get("s", "")).unicode_at(1) != 0xFFFD:
					printerr("FAIL id=%s expected NUL->U+FFFD substitution proof" % vec_id)
					failed += 1
				else:
					passed += 1
			elif expected_error == "LONE_SURROGATE":
				# RFC 8785 §3.2.2.2: Godot's JSON parser rejects lone UTF-16 surrogates.
				var jp := JSON.new()
				if jp.parse(raw_literal) == OK:
					printerr("FAIL id=%s expected JSON parser to reject lone surrogate" % vec_id)
					failed += 1
				else:
					passed += 1
			else:
				printerr("FAIL id=%s unknown expected_error=%s" % [vec_id, expected_error])
				failed += 1
			continue

		var input_val: Variant = rec.get("input", null)
		var expected_preimage := str(rec.get("expected_preimage", ""))
		var expected_hash := str(rec.get("expected_hash", ""))

		var actual_preimage: String = SidecarClient.canonical_json(input_val)
		var actual_hash: String = SidecarClient.canonical_state_hash(input_val)

		if actual_preimage != expected_preimage or actual_hash != expected_hash:
			printerr(
				"FAIL id=%s\n  expected preimage: %s\n  actual   preimage: %s\n  expected hash: %s\n  actual   hash: %s"
				% [vec_id, expected_preimage, actual_preimage, expected_hash, actual_hash]
			)
			failed += 1
		else:
			passed += 1

	# Native check 1: int(5) vs float(5.0) Dictionary typing parity.
	var five_int_pre: String = SidecarClient.canonical_json({ "n": 5 })
	var five_float_pre: String = SidecarClient.canonical_json({ "n": 5.0 })
	if five_int_pre != "{\"n\":5000000}" or five_float_pre != five_int_pre:
		printerr("FAIL native_five int=%s float=%s" % [five_int_pre, five_float_pre])
		failed += 1
	else:
		passed += 1

	# Native check 2: IEEE-754 negative zero float (-1.0 * 0.0).
	var neg_zero_native: float = -1.0 * 0.0
	var nz_pre: String = SidecarClient.canonical_json(neg_zero_native)
	if nz_pre != "0":
		printerr("FAIL native_neg_zero actual=%s" % [nz_pre])
		failed += 1
	else:
		passed += 1

	# Native check 3: matching digest_spec_version enables canonical check and emits stale on drift.
	var framing := Framing.new()
	var client_ok := SidecarClient.new()
	var stale_ok: Array = []
	client_ok.stale.connect(func(report: Dictionary) -> void: stale_ok.append(report))
	var ok_init_id := client_ok.initialize({ "notifications": true, "hashes": true, "canonicalHashes": true })
	client_ok.push_bytes(framing.encode_message({
		"jsonrpc": "2.0",
		"id": ok_init_id,
		"result": { "digest_spec_version": SidecarClient.DIGEST_SPEC_VERSION },
	}))
	var ok_snap_id := client_ok.snapshot()
	var snap_body := '{"jsonrpc":"2.0","id":%d,"result":{"tick":0,"hash":"h0","snapshotSeq":1,"canonicalHash":"cb05cdc726f0d6e0169879bd5eca3b4e","delta":[{"op":"set","path":["big"],"value":-4364405106.016257}]}}' % ok_snap_id
	var snap_bytes := snap_body.to_utf8_buffer()
	var snap_frame := ("Content-Length: %d\r\n\r\n" % snap_bytes.size()).to_utf8_buffer()
	snap_frame.append_array(snap_bytes)
	client_ok.push_bytes(snap_frame)
	var snap_ok := (
		client_ok.has_baseline
		and stale_ok.is_empty()
		and client_ok.canonical_hashes
		and client_ok.digest_version_warnings.is_empty()
		and typeof(client_ok.mirrored_state) == TYPE_DICTIONARY
		and (client_ok.mirrored_state as Dictionary).has("big")
	)
	client_ok.push_bytes(framing.encode_message({
		"jsonrpc": "2.0",
		"method": "sim/tick",
		"params": {
			"tick": 1,
			"hash": "h1",
			"snapshotSeq": 1,
			"canonicalHash": "00000000000000000000000000000000",
			"delta": [],
		},
	}))
	if not snap_ok or stale_ok.size() != 1 or str(stale_ok[0].get("kind", "")) != "canonical":
		printerr("FAIL native_canonical_client_behavior snap_ok=%s stale=%s" % [str(snap_ok), str(stale_ok)])
		failed += 1
	else:
		passed += 1

	# Native check 4: mismatched digest_spec_version disables canonical check with 1 warning and 0 stale reports.
	var client_mismatch := SidecarClient.new()
	var stale_mismatch: Array = []
	client_mismatch.stale.connect(func(report: Dictionary) -> void: stale_mismatch.append(report))
	var mm_init_id := client_mismatch.initialize({ "notifications": true, "hashes": true, "canonicalHashes": true })
	client_mismatch.push_bytes(framing.encode_message({
		"jsonrpc": "2.0",
		"id": mm_init_id,
		"result": { "digest_spec_version": 999 },
	}))
	var mm_snap_id := client_mismatch.snapshot()
	client_mismatch.push_bytes(framing.encode_message({
		"jsonrpc": "2.0",
		"id": mm_snap_id,
		"result": {
			"tick": 0,
			"hash": "h0",
			"snapshotSeq": 1,
			"canonicalHash": "deadbeefdeadbeefdeadbeefdeadbeef",
			"delta": [{ "op": "set", "path": ["big"], "value": 1 }],
		},
	}))
	client_mismatch.push_bytes(framing.encode_message({
		"jsonrpc": "2.0",
		"method": "sim/tick",
		"params": {
			"tick": 1,
			"hash": "h1",
			"snapshotSeq": 1,
			"canonicalHash": "cafebabecafebabecafebabecafebabe",
			"delta": [],
		},
	}))
	if not client_mismatch.has_baseline or client_mismatch.canonical_hashes or client_mismatch.digest_version_warnings.size() != 1 or not stale_mismatch.is_empty():
		printerr(
			"FAIL native_version_mismatch_behavior canonical=%s warnings=%d stale=%s"
			% [str(client_mismatch.canonical_hashes), client_mismatch.digest_version_warnings.size(), str(stale_mismatch)]
		)
		failed += 1
	else:
		passed += 1

	# Native check 5: _escape_json_codepoints / try_canonical_json fail clearly on surrogates & invalid canonical state (never "").
	var sur_high_err := { "ok": true }
	var sur_high: Variant = SidecarClient._escape_json_codepoints([0xD800], sur_high_err)
	var sur_low_err := { "ok": true }
	var sur_low: Variant = SidecarClient._escape_json_codepoints([0x61, 0xDFFF, 0x62], sur_low_err)
	var nan_res: Dictionary = SidecarClient.try_canonical_json({ "a": 1, "bad": NAN })
	var ascii_dict := {}
	ascii_dict["caf" + String.chr(0x00E9)] = 1
	var ascii_res: Dictionary = SidecarClient.try_canonical_json(ascii_dict)
	var big_res: Dictionary = SidecarClient.try_canonical_json({ "big": 1e10 })
	var client_err := SidecarClient.new()
	var stale_err: Array = []
	client_err.stale.connect(func(report: Dictionary) -> void: stale_err.append(report))
	client_err.mirrored_state = { "bad": NAN }
	client_err._check_canonical(1, "00000000000000000000000000000000")
	var fail_clearly_ok := (
		sur_high == null
		and sur_low == null
		and str(sur_high_err.get("code", "")) == "LONE_SURROGATE"
		and str(sur_low_err.get("code", "")) == "LONE_SURROGATE"
		and not bool(nan_res.get("ok", true))
		and str(nan_res.get("code", "")) == "NON_FINITE_NUMBER"
		and SidecarClient.canonical_json({ "bad": NAN }) == ""
		and SidecarClient.canonical_state_hash({ "bad": NAN }) == ""
		and not bool(ascii_res.get("ok", true))
		and str(ascii_res.get("code", "")) == "NON_ASCII_KEY"
		and not bool(big_res.get("ok", true))
		and str(big_res.get("code", "")) == "UNSAFE_SCALED_INTEGER"
		and stale_err.size() == 1
		and str(stale_err[0].get("kind", "")) == "canonical_error"
		and str(stale_err[0].get("code", "")) == "NON_FINITE_NUMBER"
	)
	if not fail_clearly_ok:
		printerr(
			"FAIL native_canonical_error_propagation sur_high=%s sur_low=%s nan=%s ascii=%s stale=%s"
			% [str(sur_high), str(sur_low), str(nan_res), str(ascii_res), str(stale_err)]
		)
		failed += 1
	else:
		passed += 1

	var expected_total := non_blank_lines + NATIVE_CHECK_COUNT
	if failed > 0 or passed != expected_total:
		printerr("DIGEST_VECTORS_FAIL passed=%d expected=%d failed=%d" % [passed, expected_total, failed])
		quit(1)
		return

	print("DIGEST_VECTORS_OK count=%d" % passed)
	quit(0)
