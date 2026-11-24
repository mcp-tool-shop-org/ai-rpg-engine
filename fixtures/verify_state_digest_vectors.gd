## verify_state_digest_vectors.gd — cross-language state digest vector runner.
##
## Loads res://sidecar_client.gd and res://state_digest_vectors.jsonl inside
## an imported Godot project containing sidecar_client.gd + framing.gd, then
## verifies canonical_json() and canonical_state_hash() on every vector.
extends SceneTree

const SidecarClient := preload("res://sidecar_client.gd")


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
	for i in range(lines.size()):
		var raw_line := lines[i].strip_edges()
		if raw_line.is_empty():
			continue
		var parsed: Variant = JSON.parse_string(raw_line)
		if typeof(parsed) != TYPE_DICTIONARY:
			printerr("FAIL line=%d invalid JSON" % [i + 1])
			failed += 1
			continue

		var rec := parsed as Dictionary
		var vec_id := str(rec.get("id", "line_%d" % [i + 1]))
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

	# Native Godot type checks that JSON parsing can coalesce: int(5) vs float(5.0)
	# and IEEE-754 negative zero float (-1.0 * 0.0).
	var five_int_pre: String = SidecarClient.canonical_json({ "n": 5 })
	var five_float_pre: String = SidecarClient.canonical_json({ "n": 5.0 })
	if five_int_pre != "{\"n\":5000000}" or five_float_pre != five_int_pre:
		printerr("FAIL native_five int=%s float=%s" % [five_int_pre, five_float_pre])
		failed += 1
	else:
		passed += 1

	var neg_zero_native: float = -1.0 * 0.0
	var nz_pre: String = SidecarClient.canonical_json(neg_zero_native)
	if nz_pre != "0":
		printerr("FAIL native_neg_zero actual=%s" % [nz_pre])
		failed += 1
	else:
		passed += 1

	if failed > 0:
		printerr("DIGEST_VECTORS_FAIL passed=%d failed=%d" % [passed, failed])
		quit(1)
		return

	print("DIGEST_VECTORS_OK count=%d" % passed)
	quit(0)
