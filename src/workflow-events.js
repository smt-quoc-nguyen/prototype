// Durable local event journal. BroadcastChannel signals committed state, not this interpreter.
export function emitEvent(state, name, payload, at, makeId) {
  if (typeof name !== "string" || !name.trim() || name.length > 160)
    throw Error("Tên sự kiện cần 1–160 ký tự.");
  if (payload === undefined) throw Error("Sự kiện cần payload JSON.");
  state.events ||= [];
  state.eventSequence = (state.eventSequence || 0) + 1;
  const event = {
    id: makeId("event"),
    sequence: state.eventSequence,
    name: name.trim(),
    payload: structuredClone(payload),
    at,
  };
  state.events.push(event);
  return event;
}
export function emitRecord(state, resource, record, created, at, makeId) {
  const last = [...(state.events || [])]
    .reverse()
    .find(
      (e) =>
        e.name.startsWith("record.") &&
        e.payload?.resource === resource &&
        e.payload.recordId === record.id,
    );
  if (last && JSON.stringify(last.payload.record) === JSON.stringify(record))
    return;
  return emitEvent(
    state,
    created ? "record.created" : "record.updated",
    { resource, recordId: record.id, record: structuredClone(record) },
    at,
    makeId,
  );
}
