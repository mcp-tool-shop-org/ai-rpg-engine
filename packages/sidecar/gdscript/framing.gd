# framing.gd — Content-Length framed JSON-RPC, matching packages/sidecar/src/framing.ts.
#
# Godot's JSONRPC helper class does not speak Content-Length, does not reassemble
# split TCP chunks, and does not honor the 16 MiB ceiling / resync-on-bad-header
# behaviour. This is that layer. Shared test vectors: fixtures/split-frames.json.
extends RefCounted
class_name SidecarFraming

const MAX_MESSAGE_BYTES := 16 * 1024 * 1024

signal message_received(msg: Dictionary)
signal framing_error(kind: String, detail: String)

var _buffer: PackedByteArray = PackedByteArray()


func push(chunk: PackedByteArray) -> void:
	if chunk.is_empty():
		return
	_buffer.append_array(chunk)
	_drain()


func push_text(chunk: String) -> void:
	push(chunk.to_utf8_buffer())


func encode_message(message: Dictionary) -> PackedByteArray:
	var body := JSON.stringify(message)
	var body_bytes := body.to_utf8_buffer()
	if body_bytes.size() > MAX_MESSAGE_BYTES:
		push_error("SNAPSHOT_TOO_LARGE: encoded message is %d bytes; ceiling is %d. Retry snapshot with omitEventLog: true." % [body_bytes.size(), MAX_MESSAGE_BYTES])
		return PackedByteArray()
	var header := "Content-Length: %d\r\n\r\n" % body_bytes.size()
	var out := header.to_utf8_buffer()
	out.append_array(body_bytes)
	return out


func _drain() -> void:
	while true:
		var header_end := _find_crlfcrlf(_buffer)
		if header_end < 0:
			if _buffer.size() > MAX_MESSAGE_BYTES:
				framing_error.emit("oversize", "header exceeded %d bytes without a terminator" % MAX_MESSAGE_BYTES)
				_buffer = PackedByteArray()
			return

		var header_bytes := _buffer.slice(0, header_end)
		var header := header_bytes.get_string_from_utf8()
		var length := _content_length(header)
		if length < 0:
			framing_error.emit("malformed-header", "no Content-Length in header: %s" % header)
			_buffer = _buffer.slice(header_end + 4)
			continue

		if length > MAX_MESSAGE_BYTES:
			framing_error.emit("bad-length", "Content-Length %d is out of range" % length)
			_buffer = _buffer.slice(header_end + 4)
			continue

		var body_start := header_end + 4
		if _buffer.size() < body_start + length:
			return

		var body := _buffer.slice(body_start, body_start + length).get_string_from_utf8()
		_buffer = _buffer.slice(body_start + length)

		var parsed: Variant = JSON.parse_string(body)
		if typeof(parsed) != TYPE_DICTIONARY:
			framing_error.emit("parse-error", "message body must be a JSON object")
			continue
		message_received.emit(parsed as Dictionary)


func _content_length(header: String) -> int:
	var re := RegEx.new()
	re.compile("(?i)Content-Length:\\s*(\\d+)")
	var m := re.search(header)
	if m == null:
		return -1
	var n := int(m.get_string(1))
	if n < 0:
		return -1
	return n


func _find_crlfcrlf(buf: PackedByteArray) -> int:
	var n := buf.size()
	if n < 4:
		return -1
	for i in range(n - 3):
		if buf[i] == 13 and buf[i + 1] == 10 and buf[i + 2] == 13 and buf[i + 3] == 10:
			return i
	return -1
