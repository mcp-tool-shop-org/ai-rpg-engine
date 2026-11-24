# sidecar_client.gd — Godot 4 attach client for @ai-rpg-engine/sidecar.
#
# Use --listen (TCP), not stdio pipes: GDScript pipe wrappers are documented-buggy
# upstream (godot#102340). JSON-RPC over localhost TCP is Godot's own editor wire.
#
# Staleness: position-check (server tick+hash vs last recorded position) always.
# When initialize requested canonicalHashes, also recompute canonicalStateHash
# (sorted ASCII keys, null keys retained, every number scaled by 1e6 rounded
# half-away-from-zero as plain decimal integer digits — never Godot's
# JSON.stringify or float-to-text formatting).
extends RefCounted
class_name SidecarAttachClient

const MAX_MESSAGE_BYTES := 16 * 1024 * 1024
const DIGEST_SPEC_VERSION := 2

const METHOD_INITIALIZE := "initialize"
const METHOD_SNAPSHOT := "snapshot"
const METHOD_SUBMIT_ACTION := "submitAction"
const METHOD_ADVANCE := "advance"
const METHOD_PREVIEW := "preview"
const METHOD_REPLAY := "replay"
const METHOD_LIST_ACTIONS := "listActions"
const METHOD_SAVE := "save"
const METHOD_LOAD := "load"
const METHOD_SHUTDOWN := "shutdown"
const NOTIFY_TICK := "sim/tick"
const NOTIFY_CLOSING := "sim/closing"
const NOTIFY_RESYNC_REQUIRED := "sim/resyncRequired"

signal tick(notification: Dictionary)
signal closing()
signal resync_required(notice: Dictionary)
signal stale(report: Dictionary)
signal rpc_error(code: int, message: String, data: Variant)
signal completed(id: int, result: Variant)

var framing: SidecarFraming = SidecarFraming.new()
var mirrored_state: Variant = {}
var has_baseline: bool = false
var applied_snapshot_seq: int = 0
var last_tick: int = -1
var last_hash: String = ""
var canonical_hashes: bool = false
var server_digest_spec_version: int = 0
var digest_version_warnings: Array[String] = []
var writes: bool = true
## Reject in-flight RPCs after this many ms. 0 = wait indefinitely (JS default 30000).
var request_timeout_ms: int = 30000

var _socket: StreamPeerTCP
var _next_id: int = 1
var _pending: Dictionary = {}
var _snapshot_in_flight: int = 0
var _queued_ticks: Array = []
var _closed: bool = false


func _init() -> void:
	framing.message_received.connect(_on_message)
	framing.framing_error.connect(_on_framing_error)


func connect_to_host(host: String, port: int) -> int:
	_closed = false
	_socket = StreamPeerTCP.new()
	_socket.set_no_delay(true)
	return _socket.connect_to_host(host, port)


func poll() -> void:
	if _socket == null:
		return
	_socket.poll()
	var status := _socket.get_status()
	if status == StreamPeerTCP.STATUS_NONE or status == StreamPeerTCP.STATUS_ERROR:
		_fail_transport("peer closed")
		return
	_check_timeouts()
	var avail := _socket.get_available_bytes()
	if avail > 0:
		var got: Array = _socket.get_data(avail)
		if got[0] == OK:
			framing.push(got[1])


func disconnect_from_host() -> void:
	_fail_transport("disconnect")


func push_bytes(chunk: PackedByteArray) -> void:
	framing.push(chunk)


func initialize(capabilities: Dictionary = { "notifications": true, "hashes": true, "canonicalHashes": true, "audio": true }) -> int:
	canonical_hashes = bool(capabilities.get("canonicalHashes", false))
	writes = capabilities.get("writes", true) != false
	if str(capabilities.get("role", "")) == "observer":
		writes = false
	return _request(METHOD_INITIALIZE, {
		"clientName": "godot-sidecar",
		"clientVersion": "4.x",
		"capabilities": capabilities,
	})


func snapshot(params: Dictionary = {}) -> int:
	_snapshot_in_flight += 1
	_queued_ticks.clear()
	return _request(METHOD_SNAPSHOT, params)


func submit_action(verb: String, extra: Dictionary = {}) -> int:
	var params := extra.duplicate()
	params["verb"] = verb
	return _request(METHOD_SUBMIT_ACTION, params)


func advance(rounds: int = 1) -> int:
	return _request(METHOD_ADVANCE, { "rounds": rounds })


func preview(verb: String, extra: Dictionary = {}) -> int:
	var params := extra.duplicate()
	params["verb"] = verb
	return _request(METHOD_PREVIEW, params)


func replay(params: Dictionary = {}) -> int:
	return _request(METHOD_REPLAY, params)


func list_actions(actor_id: String = "") -> int:
	var params := {}
	if actor_id != "":
		params["actorId"] = actor_id
	return _request(METHOD_LIST_ACTIONS, params)


func save() -> int:
	return _request(METHOD_SAVE, {})


func load_save(serialized: String) -> int:
	return _request(METHOD_LOAD, { "serialized": serialized })


func shutdown() -> int:
	return _request(METHOD_SHUTDOWN, {})


func _request(method: String, params: Dictionary) -> int:
	var id := _next_id
	_next_id += 1
	_pending[id] = { "method": method, "started": Time.get_ticks_msec() }
	_send({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
	return id


func _send(msg: Dictionary) -> void:
	var frame := framing.encode_message(msg)
	if frame.is_empty() or _socket == null:
		return
	_socket.put_data(frame)


func _on_framing_error(kind: String, detail: String) -> void:
	push_warning("[sidecar] framing error: %s: %s" % [kind, detail])


func _normalize_rpc_id(id: Variant) -> Variant:
	if typeof(id) == TYPE_FLOAT:
		var f := float(id)
		if f == floor(f):
			return int(f)
	return id


func _pending_method(id: Variant) -> String:
	var rec: Variant = _pending.get(_normalize_rpc_id(id), null)
	if typeof(rec) == TYPE_DICTIONARY:
		return str(rec.get("method", ""))
	return str(rec) if rec != null else ""


func _check_timeouts() -> void:
	if request_timeout_ms <= 0:
		return
	var now := Time.get_ticks_msec()
	var expired: Array = []
	for id in _pending.keys():
		var rec: Variant = _pending[id]
		if typeof(rec) != TYPE_DICTIONARY:
			continue
		var started := int(rec.get("started", now))
		if now - started >= request_timeout_ms:
			expired.append(id)
	for id in expired:
		var method := _pending_method(id)
		_pending.erase(id)
		rpc_error.emit(-32603, "request timed out", { "method": method, "id": id })
		if method == METHOD_SNAPSHOT and _snapshot_in_flight > 0:
			_snapshot_in_flight -= 1
			_flush_queued_ticks()


func _fail_pending() -> void:
	var waiting: Array = _pending.keys()
	_pending.clear()
	_snapshot_in_flight = 0
	for id in waiting:
		rpc_error.emit(-32004, "session is closed; further methods are refused.", { "id": id })


func _fail_transport(_reason: String) -> void:
	if _closed:
		return
	_closed = true
	_fail_pending()
	closing.emit()
	if _socket != null:
		_socket.disconnect_from_host()
		_socket = null


func _on_message(msg: Dictionary) -> void:
	if msg.has("method"):
		_handle_notification(str(msg["method"]), msg.get("params", {}))
		return
	var id: Variant = _normalize_rpc_id(msg.get("id", null))
	var method: String = _pending_method(id)
	_pending.erase(id)
	if msg.has("error"):
		var err: Dictionary = msg["error"]
		rpc_error.emit(int(err.get("code", 0)), str(err.get("message", "")), err.get("data", null))
		if method == METHOD_SNAPSHOT and _snapshot_in_flight > 0:
			_snapshot_in_flight -= 1
			_flush_queued_ticks()
		return
	var result: Variant = msg.get("result", {})
	if method == METHOD_INITIALIZE:
		var has_ver := false
		if typeof(result) == TYPE_DICTIONARY and result.has("digest_spec_version"):
			var raw_ver: Variant = result["digest_spec_version"]
			if typeof(raw_ver) == TYPE_INT or typeof(raw_ver) == TYPE_FLOAT:
				var ver_f := float(raw_ver)
				if ver_f == floor(ver_f):
					has_ver = true
					server_digest_spec_version = int(ver_f)
		if not has_ver:
			server_digest_spec_version = 0
		if canonical_hashes and (not has_ver or server_digest_spec_version != DIGEST_SPEC_VERSION):
			canonical_hashes = false
			var got_label := str(server_digest_spec_version) if has_ver else "missing"
			var warn_msg := "SidecarAttachClient: digest_spec_version mismatch (client=%d, server=%s); disabling canonicalHashes verification" % [DIGEST_SPEC_VERSION, got_label]
			digest_version_warnings.append(warn_msg)
			push_warning(warn_msg)
	elif method == METHOD_SNAPSHOT:
		_apply_snapshot(result)
	elif method == METHOD_SUBMIT_ACTION or method == METHOD_ADVANCE or method == METHOD_LOAD:
		if typeof(result) == TYPE_DICTIONARY:
			_note_position(int(result.get("tick", last_tick)), str(result.get("hash", last_hash)))
	if typeof(id) == TYPE_FLOAT or typeof(id) == TYPE_INT:
		completed.emit(int(id), result)


func _handle_notification(method: String, params: Variant) -> void:
	if method == NOTIFY_CLOSING:
		_fail_transport("sim/closing")
		return
	if method == NOTIFY_RESYNC_REQUIRED:
		var notice: Dictionary = params if typeof(params) == TYPE_DICTIONARY else {}
		resync_required.emit(notice)
		return
	if method != NOTIFY_TICK:
		return
	var tick_msg: Dictionary = params if typeof(params) == TYPE_DICTIONARY else {}
	if _snapshot_in_flight > 0:
		_queued_ticks.append(tick_msg)
		return
	_apply_tick(tick_msg)


func _apply_snapshot(result: Variant) -> void:
	var snap: Dictionary = result if typeof(result) == TYPE_DICTIONARY else {}
	mirrored_state = apply_patches({}, snap.get("delta", []))
	has_baseline = true
	applied_snapshot_seq = int(snap.get("snapshotSeq", applied_snapshot_seq + 1))
	_note_position(int(snap.get("tick", 0)), str(snap.get("hash", "")))
	if canonical_hashes and snap.has("canonicalHash"):
		_check_canonical(int(snap.get("tick", 0)), str(snap["canonicalHash"]))
	if _snapshot_in_flight > 0:
		_snapshot_in_flight -= 1
	_flush_queued_ticks()


func _flush_queued_ticks() -> void:
	var queued: Array = _queued_ticks.duplicate()
	_queued_ticks.clear()
	for t in queued:
		_apply_tick(t)


func _apply_tick(tick_msg: Dictionary) -> void:
	if not has_baseline:
		return
	var seq := int(tick_msg.get("snapshotSeq", applied_snapshot_seq))
	if tick_msg.has("snapshotSeq") and seq < applied_snapshot_seq:
		return
	mirrored_state = apply_patches(mirrored_state, tick_msg.get("delta", []))
	_note_position(int(tick_msg.get("tick", last_tick)), str(tick_msg.get("hash", last_hash)))
	if canonical_hashes and tick_msg.has("canonicalHash"):
		_check_canonical(int(tick_msg.get("tick", 0)), str(tick_msg["canonicalHash"]))
	tick.emit(tick_msg)


func _note_position(tick_n: int, hash: String) -> void:
	# Position-check: compare the server's reported tick+hash to the last
	# recorded position. A missed delta leaves the client's tick behind.
	# Does not recompute JS JSON.stringify bytes (those never match Godot).
	if last_tick >= 0 and tick_n == last_tick and hash != "" and last_hash != "" and hash != last_hash:
		var report := { "tick": tick_n, "expected": hash, "actual": last_hash, "kind": "position" }
		stale.emit(report)
	if tick_n < last_tick:
		stale.emit({ "tick": tick_n, "expected": last_hash, "actual": hash, "kind": "rewind" })
	last_tick = tick_n
	last_hash = hash


func _check_canonical(tick_n: int, expected: String) -> void:
	var res := try_canonical_state_hash(mirrored_state)
	if not bool(res.get("ok", false)):
		stale.emit({
			"tick": tick_n,
			"expected": expected,
			"actual": "",
			"kind": "canonical_error",
			"code": str(res.get("code", "CANONICAL_ERROR")),
			"message": str(res.get("message", "canonical hashing failed")),
		})
		return
	var actual := str(res["hash"])
	if actual != expected:
		stale.emit({ "tick": tick_n, "expected": expected, "actual": actual, "kind": "canonical" })


static func apply_patches(target: Variant, patches: Variant) -> Variant:
	var root: Variant = target
	if typeof(patches) != TYPE_ARRAY:
		return root
	for patch in patches:
		if typeof(patch) != TYPE_DICTIONARY:
			continue
		var path: Array = patch.get("path", [])
		var op := str(patch.get("op", "set"))
		if path.is_empty():
			root = patch.get("value", null) if op == "set" else null
			continue
		var parent: Variant = _resolve_parent(root, path)
		if parent == null:
			continue
		var key: Variant = path[path.size() - 1]
		if op == "remove":
			if typeof(parent) == TYPE_ARRAY:
				(parent as Array).remove_at(int(key))
			elif typeof(parent) == TYPE_DICTIONARY:
				(parent as Dictionary).erase(str(key))
		else:
			if typeof(parent) == TYPE_ARRAY:
				var idx := int(key)
				var arr := parent as Array
				while arr.size() <= idx:
					arr.append(null)
				arr[idx] = patch.get("value", null)
			elif typeof(parent) == TYPE_DICTIONARY:
				(parent as Dictionary)[str(key)] = patch.get("value", null)
	return root


static func _resolve_parent(root: Variant, path: Array) -> Variant:
	var node: Variant = root
	for i in range(path.size() - 1):
		if typeof(node) != TYPE_DICTIONARY and typeof(node) != TYPE_ARRAY:
			return null
		var key: Variant = path[i]
		var next: Variant = null
		if typeof(node) == TYPE_ARRAY:
			var idx := int(key)
			if idx >= 0 and idx < (node as Array).size():
				next = (node as Array)[idx]
		else:
			next = (node as Dictionary).get(str(key), null)
		if next == null:
			var nxt_key: Variant = path[i + 1]
			if typeof(nxt_key) == TYPE_FLOAT or typeof(nxt_key) == TYPE_INT:
				next = []
			else:
				next = {}
			if typeof(node) == TYPE_ARRAY:
				var idx := int(key)
				var arr := node as Array
				while arr.size() <= idx:
					arr.append(null)
				arr[idx] = next
			else:
				(node as Dictionary)[str(key)] = next
		node = next
	return node


static func _fail_canonical(err: Variant, code: String, msg: String) -> Variant:
	if typeof(err) == TYPE_DICTIONARY:
		var err_dict := err as Dictionary
		if not err_dict.has("ok") or bool(err_dict.get("ok", true)):
			err_dict["ok"] = false
			err_dict["code"] = code
			err_dict["message"] = msg
	push_error("SidecarAttachClient: " + msg)
	return null


static func try_canonical_json(value: Variant) -> Dictionary:
	var err := { "ok": true }
	var out: Variant = _write_canonical(value, err)
	if out == null or not bool(err.get("ok", true)):
		return {
			"ok": false,
			"code": str(err.get("code", "CANONICAL_ERROR")),
			"message": str(err.get("message", "canonical JSON serialization failed")),
		}
	return { "ok": true, "json": str(out) }


static func canonical_json(value: Variant) -> String:
	var res := try_canonical_json(value)
	return str(res["json"]) if bool(res.get("ok", false)) else ""


static func try_canonical_state_hash(state: Variant) -> Dictionary:
	var res := try_canonical_json(state)
	if not bool(res.get("ok", false)):
		return res
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(str(res["json"]).to_utf8_buffer())
	return { "ok": true, "hash": ctx.finish().hex_encode().substr(0, 32) }


static func canonical_state_hash(state: Variant) -> String:
	var res := try_canonical_state_hash(state)
	return str(res["hash"]) if bool(res.get("ok", false)) else ""


static func _escape_json_codepoints(cps: Array, err: Variant = null) -> Variant:
	var out := "\""
	for cp_v in cps:
		var cp := int(cp_v)
		match cp:
			0x22:
				out += "\\\""
			0x5C:
				out += "\\\\"
			0x08:
				out += "\\b"
			0x0C:
				out += "\\f"
			0x0A:
				out += "\\n"
			0x0D:
				out += "\\r"
			0x09:
				out += "\\t"
			_:
				if cp == 0x0000:
					return _fail_canonical(err, "NUL_CHARACTER", "NUL/lone-surrogate rule (NUL_CHARACTER): U+0000 is invalid in canonical JSON")
				elif cp < 0 or cp > 0x10FFFF:
					return _fail_canonical(err, "INVALID_CODEPOINT", "invalid Unicode scalar %d in canonical JSON" % cp)
				elif cp >= 0xD800 and cp <= 0xDFFF:
					return _fail_canonical(err, "LONE_SURROGATE", "NUL/lone-surrogate rule (LONE_SURROGATE): lone surrogate U+%04X is invalid in canonical JSON" % cp)
				elif cp < 0x20:
					out += "\\u%04x" % cp
				else:
					out += char(cp)
	out += "\""
	return out


static func _escape_json_string(s: String, err: Variant = null) -> Variant:
	var cps: Array = []
	for i in range(s.length()):
		cps.append(s.unicode_at(i))
	return _escape_json_codepoints(cps, err)


static func _write_canonical(value: Variant, err: Variant = null) -> Variant:
	match typeof(value):
		TYPE_NIL:
			return "null"
		TYPE_BOOL:
			return "true" if value else "false"
		TYPE_INT, TYPE_FLOAT:
			var f := float(value)
			if is_nan(f) or is_inf(f):
				return _fail_canonical(err, "NON_FINITE_NUMBER", "JSON-number rule (NON_FINITE_NUMBER): non-finite number is invalid in canonical JSON")
			var scaled: float = f * 1e6
			if is_nan(scaled) or is_inf(scaled) or absf(scaled) > 9007199254740991.0 or absf(roundf(scaled)) > 9007199254740991.0:
				return _fail_canonical(err, "UNSAFE_SCALED_INTEGER", "integer-range rule (UNSAFE_SCALED_INTEGER): scaled number exceeds safe integer bound (2^53 - 1)")
			var rounded: int = int(roundf(scaled))
			return "0" if rounded == 0 else str(rounded)
		TYPE_STRING:
			return _escape_json_string(value, err)
		TYPE_ARRAY:
			var parts: PackedStringArray = PackedStringArray()
			for item in value:
				var written: Variant = _write_canonical(item, err)
				if written == null:
					return null
				parts.append(str(written))
			return "[" + ",".join(parts) + "]"
		TYPE_DICTIONARY:
			var pairs: Array = []
			for k in (value as Dictionary).keys():
				var k_str := str(k)
				for ki in range(k_str.length()):
					var kcp := k_str.unicode_at(ki)
					if kcp == 0x0000:
						return _fail_canonical(err, "NUL_CHARACTER", "ASCII-key rule (NUL_CHARACTER): object key contains U+0000")
					if kcp > 0x7F:
						return _fail_canonical(err, "NON_ASCII_KEY", "ASCII-key rule (NON_ASCII_KEY): object key contains non-ASCII character U+%04X" % kcp)
				pairs.append([k_str, k])
			pairs.sort_custom(func(a: Array, b: Array) -> bool: return String(a[0]) < String(b[0]))
			var parts: PackedStringArray = PackedStringArray()
			for pair in pairs:
				var k_str: String = pair[0]
				var orig_k: Variant = pair[1]
				var v: Variant = (value as Dictionary)[orig_k]
				var ek: Variant = _escape_json_string(k_str, err)
				if ek == null:
					return null
				var ev: Variant = _write_canonical(v, err)
				if ev == null:
					return null
				parts.append(str(ek) + ":" + str(ev))
			return "{" + ",".join(parts) + "}"
		_:
			return _fail_canonical(err, "UNSUPPORTED_VALUE_TYPE", "JSON-value rule (UNSUPPORTED_VALUE_TYPE): unsupported Variant type %d in canonical JSON" % typeof(value))
