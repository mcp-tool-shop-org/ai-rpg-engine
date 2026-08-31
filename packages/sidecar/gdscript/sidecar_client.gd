# sidecar_client.gd — Godot 4 attach client for @ai-rpg-engine/sidecar.
#
# Use --listen (TCP), not stdio pipes: GDScript pipe wrappers are documented-buggy
# upstream (godot#102340). JSON-RPC over localhost TCP is Godot's own editor wire.
#
# Staleness: position-check (server tick+hash vs last recorded position) always.
# When initialize requested canonicalHashes, also recompute canonicalStateHash
# (sorted keys, integers stay integers) — never Godot's JSON.stringify, which
# emits 5.0 and alphabetizes keys.
extends RefCounted
class_name SidecarAttachClient

const MAX_MESSAGE_BYTES := 16 * 1024 * 1024
const WIRE_PRECISION := 6

const METHOD_INITIALIZE := "initialize"
const METHOD_SNAPSHOT := "snapshot"
const METHOD_SUBMIT_ACTION := "submitAction"
const METHOD_ADVANCE := "advance"
const METHOD_PREVIEW := "preview"
const METHOD_REPLAY := "replay"
const METHOD_SHUTDOWN := "shutdown"
const NOTIFY_TICK := "sim/tick"
const NOTIFY_CLOSING := "sim/closing"

signal tick(notification: Dictionary)
signal closing()
signal stale(report: Dictionary)
signal rpc_error(code: int, message: String, data: Variant)

var framing: SidecarFraming = SidecarFraming.new()
var mirrored_state: Variant = {}
var has_baseline: bool = false
var applied_snapshot_seq: int = 0
var last_tick: int = -1
var last_hash: String = ""
var canonical_hashes: bool = false
var writes: bool = true

var _socket: StreamPeerTCP
var _next_id: int = 1
var _pending: Dictionary = {}
var _snapshot_in_flight: int = 0
var _queued_ticks: Array = []


func _init() -> void:
	framing.message_received.connect(_on_message)
	framing.framing_error.connect(_on_framing_error)


func connect_to_host(host: String, port: int) -> int:
	_socket = StreamPeerTCP.new()
	_socket.set_no_delay(true)
	return _socket.connect_to_host(host, port)


func poll() -> void:
	if _socket == null:
		return
	_socket.poll()
	var avail := _socket.get_available_bytes()
	if avail > 0:
		var got: Array = _socket.get_data(avail)
		if got[0] == OK:
			framing.push(got[1])


func push_bytes(chunk: PackedByteArray) -> void:
	framing.push(chunk)


func initialize(capabilities: Dictionary = { "notifications": true, "hashes": true, "canonicalHashes": true }) -> void:
	canonical_hashes = bool(capabilities.get("canonicalHashes", false))
	writes = capabilities.get("writes", true) != false
	if str(capabilities.get("role", "")) == "observer":
		writes = false
	_request(METHOD_INITIALIZE, {
		"clientName": "godot-sidecar",
		"clientVersion": "4.x",
		"capabilities": capabilities,
	})


func snapshot(params: Dictionary = {}) -> void:
	_snapshot_in_flight += 1
	_queued_ticks.clear()
	_request(METHOD_SNAPSHOT, params)


func submit_action(verb: String, extra: Dictionary = {}) -> void:
	var params := extra.duplicate()
	params["verb"] = verb
	_request(METHOD_SUBMIT_ACTION, params)


func _request(method: String, params: Dictionary) -> int:
	var id := _next_id
	_next_id += 1
	_pending[id] = method
	_send({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
	return id


func _send(msg: Dictionary) -> void:
	var frame := framing.encode_message(msg)
	if frame.is_empty() or _socket == null:
		return
	_socket.put_data(frame)


func _on_framing_error(kind: String, detail: String) -> void:
	push_warning("[sidecar] framing error: %s: %s" % [kind, detail])


func _on_message(msg: Dictionary) -> void:
	if msg.has("method"):
		_handle_notification(str(msg["method"]), msg.get("params", {}))
		return
	var id: Variant = msg.get("id", null)
	var method: String = str(_pending.get(id, ""))
	_pending.erase(id)
	if msg.has("error"):
		var err: Dictionary = msg["error"]
		rpc_error.emit(int(err.get("code", 0)), str(err.get("message", "")), err.get("data", null))
		if method == METHOD_SNAPSHOT and _snapshot_in_flight > 0:
			_snapshot_in_flight -= 1
			_flush_queued_ticks()
		return
	var result: Variant = msg.get("result", {})
	if method == METHOD_SNAPSHOT:
		_apply_snapshot(result)
	elif method == METHOD_SUBMIT_ACTION or method == METHOD_ADVANCE:
		_note_position(int(result.get("tick", last_tick)), str(result.get("hash", last_hash)))


func _handle_notification(method: String, params: Variant) -> void:
	if method == NOTIFY_CLOSING:
		closing.emit()
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
	var actual := canonical_state_hash(mirrored_state)
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


static func canonical_json(value: Variant) -> String:
	return _write_canonical(_quantize(value))


static func canonical_state_hash(state: Variant) -> String:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(canonical_json(state).to_utf8_buffer())
	return ctx.finish().hex_encode().substr(0, 32)


static func _quantize(value: Variant) -> Variant:
	match typeof(value):
		TYPE_FLOAT, TYPE_INT:
			if typeof(value) == TYPE_INT or value == floor(value):
				return int(value)
			var factor := pow(10.0, WIRE_PRECISION)
			return round(float(value) * factor) / factor
		TYPE_ARRAY:
			var out: Array = []
			for item in value:
				out.append(_quantize(item))
			return out
		TYPE_DICTIONARY:
			var keys: Array = (value as Dictionary).keys()
			keys.sort()
			var out := {}
			for k in keys:
				var v: Variant = (value as Dictionary)[k]
				if v == null:
					continue
				out[str(k)] = _quantize(v)
			return out
		_:
			return value


static func _write_canonical(value: Variant) -> String:
	match typeof(value):
		TYPE_NIL:
			return "null"
		TYPE_BOOL:
			return "true" if value else "false"
		TYPE_INT:
			return str(int(value))
		TYPE_FLOAT:
			if value == floor(value):
				return str(int(value))
			var s := "%.*f" % [WIRE_PRECISION, float(value)]
			while s.ends_with("0"):
				s = s.substr(0, s.length() - 1)
			if s.ends_with("."):
				s += "0"
			return s
		TYPE_STRING:
			return JSON.stringify(value)
		TYPE_ARRAY:
			var parts: PackedStringArray = PackedStringArray()
			for item in value:
				parts.append(_write_canonical(item))
			return "[" + ",".join(parts) + "]"
		TYPE_DICTIONARY:
			var keys: Array = (value as Dictionary).keys()
			keys.sort()
			var parts: PackedStringArray = PackedStringArray()
			for k in keys:
				var v: Variant = (value as Dictionary)[k]
				if v == null:
					continue
				parts.append(JSON.stringify(str(k)) + ":" + _write_canonical(v))
			return "{" + ",".join(parts) + "}"
		_:
			return "null"
