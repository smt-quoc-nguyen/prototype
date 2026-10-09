import React, { useState } from "react";
import { Plus, Trash2, Info, Bell, UserRound } from "lucide-react";
import { literal, reference } from "./graph.js";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_KINDS,
} from "./notification-schema.js";
import {
  OPERATIONS,
  OPERATORS,
  VALUES,
  FIELDS,
  RESOURCES,
  availableSources,
  bindingKey,
  sourceLabel,
  exampleValue,
  fieldLabel,
} from "./workflow-presentation.js";
export function FormField({ label, hint, children }) {
  const fieldId = React.useId();
  const control =
    React.isValidElement(children) && typeof children.type === "string"
      ? React.cloneElement(children, {
          id: fieldId,
          "aria-labelledby": children.props["aria-label"]
            ? undefined
            : `${fieldId}-label`,
        })
      : children;
  return (
    <label className="business-field" htmlFor={fieldId}>
      <span id={`${fieldId}-label`}>{label}</span>
      {control}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function SourceSelect({
  label,
  binding,
  workflow,
  node,
  onChange,
  filter = () => true,
  empty = "Chọn thông tin",
}) {
  const sources = availableSources(workflow, node).filter(filter);
  const known = sources.some(
    (s) => bindingKey(s.binding) === bindingKey(binding),
  );
  return (
    <FormField label={label}>
      <select
        value={binding ? bindingKey(binding) : ""}
        onChange={(e) => onChange(JSON.parse(e.target.value))}
      >
        <option value="" disabled>
          {empty}
        </option>
        {!known && binding?.kind === "reference" && (
          <option value={bindingKey(binding)}>
            {sourceLabel(binding, workflow)}
          </option>
        )}
        {sources.map((s) => (
          <option key={bindingKey(s.binding)} value={bindingKey(s.binding)}>
            {s.group} · {s.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}
export function BusinessBinding({
  label,
  binding,
  workflow,
  node,
  onChange,
  choices,
  number = false,
  multiline = false,
  hint,
}) {
  const b = binding || literal("");
  const dynamic = b.kind !== "literal";
  return (
    <div className="business-binding">
      <FormField label={`Cách điền ${label.toLowerCase()}`} hint={hint}>
        <select
          aria-label={`Cách chọn ${label}`}
          value={dynamic ? "data" : "manual"}
          onChange={(e) =>
            onChange(
              e.target.value === "manual"
                ? literal("")
                : reference("trigger", "title"),
            )
          }
        >
          <option value="manual">Tự nhập</option>
          <option value="data">Dùng thông tin từ quy trình</option>
        </select>
      </FormField>
      {dynamic ? (
        <SourceSelect
          label={`Lấy ${label.toLowerCase()} từ`}
          binding={b}
          workflow={workflow}
          node={node}
          onChange={onChange}
        />
      ) : choices ? (
        <FormField label={label}>
          <select
            value={b.value}
            onChange={(e) => onChange(literal(e.target.value))}
          >
            <option value="" disabled>
              Chọn giá trị
            </option>
            {choices.map((c) => (
              <option
                key={typeof c === "string" ? c : c.value}
                value={typeof c === "string" ? c : c.value}
              >
                {typeof c === "string" ? VALUES[c] || c : c.label}
              </option>
            ))}
          </select>
        </FormField>
      ) : typeof b.value === "object" && b.value !== null ? (
        <p className="business-hint">
          Giá trị này là dữ liệu ghép. Giữ nguyên hoặc mở Cấu hình nâng cao để
          chỉnh chi tiết.
        </p>
      ) : typeof b.value === "boolean" ? (
        <FormField label={label}>
          <select
            value={String(b.value)}
            onChange={(e) => onChange(literal(e.target.value === "true"))}
          >
            <option value="true">Có</option>
            <option value="false">Không</option>
          </select>
        </FormField>
      ) : (
        <FormField label={label}>
          {multiline ? (
            <textarea
              rows={3}
              value={b.value ?? ""}
              onChange={(e) => onChange(literal(e.target.value))}
            />
          ) : (
            <input
              type={number || typeof b.value === "number" ? "number" : "text"}
              value={b.value ?? ""}
              onChange={(e) =>
                onChange(
                  literal(
                    number || typeof b.value === "number"
                      ? Number(e.target.value)
                      : e.target.value,
                  ),
                )
              }
            />
          )}
        </FormField>
      )}
    </div>
  );
}
export function MessageComposer({ label, binding, workflow, node, onChange }) {
  const parts =
    binding?.kind === "template" ? binding.parts : [binding || literal("")];
  const update = (i, b) =>
    onChange({
      kind: "template",
      parts: parts.map((p, index) => (index === i ? b : p)),
    });
  return (
    <div className="message-composer">
      <div className="business-section-title">{label}</div>
      {parts.map((p, i) => (
        <div className="message-part" key={i}>
          {p.kind === "literal" ? (
            <textarea
              aria-label={`${label} · đoạn ${i + 1}`}
              rows={label === "Tiêu đề thông báo" ? 1 : 3}
              value={p.value ?? ""}
              placeholder={
                label === "Tiêu đề thông báo"
                  ? "Ví dụ: Có cập nhật mới"
                  : "Viết nội dung người nhận cần biết…"
              }
              onChange={(e) => update(i, literal(e.target.value))}
            />
          ) : (
            <div className="data-chip">
              <Info size={13} />
              {sourceLabel(p, workflow)}
            </div>
          )}
          {parts.length > 1 && (
            <button
              type="button"
              className="icon-btn"
              aria-label={`Xóa ${label.toLowerCase()} · phần ${i + 1}`}
              onClick={() =>
                onChange({
                  kind: "template",
                  parts: parts.filter((_, index) => index !== i),
                })
              }
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      <div className="composer-tools">
        <select
          aria-label={`Chèn thông tin vào ${label.toLowerCase()}`}
          value=""
          onChange={(e) => {
            onChange({
              kind: "template",
              parts: [...parts, JSON.parse(e.target.value), literal("")],
            });
          }}
        >
          <option value="">＋ Chèn thông tin từ quy trình</option>
          {availableSources(workflow, node)
            .filter(
              (s) =>
                ![
                  "action",
                  "payload",
                  "record",
                  "sequence",
                  "eventId",
                ].includes(s.binding.path),
            )
            .map((s) => (
              <option key={bindingKey(s.binding)} value={bindingKey(s.binding)}>
                {s.group} · {s.label}
              </option>
            ))}
        </select>
        {parts.at(-1)?.kind !== "literal" && (
          <button
            className="btn"
            onClick={() =>
              onChange({ kind: "template", parts: [...parts, literal("")] })
            }
          >
            Thêm đoạn văn
          </button>
        )}
      </div>
      <small>Thông tin được thay bằng giá trị thực khi quy trình chạy.</small>
    </div>
  );
}
function recipientParts(binding) {
  if (binding?.kind === "list") return binding.items.flatMap(recipientParts);
  if (binding?.kind === "reference") return [binding];
  if (binding?.kind === "literal")
    return [
      literal(
        Array.isArray(binding.value)
          ? binding.value
          : binding.value
            ? [binding.value]
            : [],
      ),
    ];
  return [];
}
export function NotificationConfig({ node, workflow, patch, users, run }) {
  const inputs = node.inputs;
  const parts = recipientParts(inputs.recipients);
  const selected = parts
    .filter((p) => p.kind === "literal")
    .flatMap((p) => p.value);
  const refs = parts.filter((p) => p.kind === "reference");
  const sourceChoices = availableSources(workflow, node, true);
  const updateRecipients = (people, sources) =>
    patch({
      inputs: {
        ...inputs,
        recipients: { kind: "list", items: [literal(people), ...sources] },
      },
    });
  const sample = exampleValue(inputs.recipients, workflow, run);
  const previewRecipients = [
    ...new Set(Array.isArray(sample) ? sample : [sample]),
  ]
    .map(
      (userId) =>
        Object.values(users).find((u) => u.id === userId)?.name || userId,
    )
    .filter(Boolean);
  return (
    <div className="notification-config">
      <section className="business-section">
        <h3>
          <span>1</span> Gửi cho ai?
        </h3>
        <p>
          Chọn người cụ thể hoặc lấy người liên quan từ các bước trước. Bạn có
          thể kết hợp cả hai.
        </p>
        <fieldset className="business-options">
          <legend>Người cụ thể</legend>
          {Object.values(users).map((user) => (
            <label key={user.id}>
              <input
                type="checkbox"
                checked={selected.includes(user.id)}
                onChange={(e) =>
                  updateRecipients(
                    e.target.checked
                      ? [...selected, user.id]
                      : selected.filter((x) => x !== user.id),
                    refs,
                  )
                }
              />
              <UserRound size={14} />
              <span>{user.name}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="business-options">
          <legend>Người liên quan trong quy trình</legend>
          {sourceChoices.map((source) => (
            <label key={bindingKey(source.binding)}>
              <input
                type="checkbox"
                checked={refs.some(
                  (r) => bindingKey(r) === bindingKey(source.binding),
                )}
                onChange={(e) =>
                  updateRecipients(
                    selected,
                    e.target.checked
                      ? [...refs, source.binding]
                      : refs.filter(
                          (r) => bindingKey(r) !== bindingKey(source.binding),
                        ),
                  )
                }
              />
              <span>
                {source.group} · {source.label}
              </span>
            </label>
          ))}
        </fieldset>
        {!selected.length && !refs.length && (
          <p className="business-warning">
            Chọn ít nhất một người nhận để bước này có thể chạy.
          </p>
        )}
      </section>
      <section className="business-section">
        <h3>
          <span>2</span> Gửi qua đâu?
        </h3>
        <fieldset className="business-options">
          <legend>Kênh gửi</legend>
          {NOTIFICATION_CHANNELS.map((channel) => (
            <label key={channel.id}>
              <input
                type="checkbox"
                checked={node.channels.includes(channel.id)}
                onChange={(e) =>
                  patch({
                    channels: e.target.checked
                      ? [...node.channels, channel.id]
                      : node.channels.filter((c) => c !== channel.id),
                  })
                }
              />
              <span>
                {channel.label}
                <small>{channel.description}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <FormField label="Mục đích thông báo">
          <select
            value={node.notificationKind || "info"}
            onChange={(e) => patch({ notificationKind: e.target.value })}
          >
            {Object.entries(NOTIFICATION_KINDS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
      </section>
      <section className="business-section">
        <h3>
          <span>3</span> Người nhận cần biết gì?
        </h3>
        <MessageComposer
          label="Tiêu đề thông báo"
          binding={inputs.subject}
          workflow={workflow}
          node={node}
          onChange={(b) => patch({ inputs: { ...inputs, subject: b } })}
        />
        <MessageComposer
          label="Nội dung thông báo"
          binding={inputs.message}
          workflow={workflow}
          node={node}
          onChange={(b) => patch({ inputs: { ...inputs, message: b } })}
        />
      </section>
      <details className="business-more">
        <summary>Mở dữ liệu khi bấm thông báo (tùy chọn)</summary>
        <FormField label="Dữ liệu sẽ mở">
          <select
            value={inputs.contextResource?.value || ""}
            onChange={(e) =>
              patch({
                inputs: {
                  ...inputs,
                  contextResource: literal(e.target.value),
                  contextId:
                    e.target.value === "ticket"
                      ? reference("trigger", "id")
                      : literal(""),
                },
              })
            }
          >
            <option value="">Không mở dữ liệu</option>
            {Object.entries(RESOURCES).map(([id, r]) => (
              <option key={id} value={id}>
                {r.label}
              </option>
            ))}
          </select>
        </FormField>
        {inputs.contextResource?.value && (
          <SourceSelect
            label="Chọn dữ liệu liên quan"
            binding={
              inputs.contextId?.kind === "reference" ? inputs.contextId : null
            }
            workflow={workflow}
            node={node}
            filter={(s) =>
              inputs.contextResource.value === "ticket"
                ? ["id", "ticketId", "recordId"].includes(s.binding.path)
                : ["workOrderId", "recordId"].includes(s.binding.path)
            }
            onChange={(b) => patch({ inputs: { ...inputs, contextId: b } })}
          />
        )}
      </details>
      <section className="notification-preview">
        <div>
          <Bell size={16} />
          <strong>Người nhận sẽ thấy</strong>
          <small>
            {run ? "Dữ liệu của lần chạy thử" : "Minh họa bằng dữ liệu mẫu"}
          </small>
        </div>
        <p className="preview-audience">
          Đến: {previewRecipients.join(", ") || "Chưa chọn người nhận"}
        </p>
        <strong>
          {String(exampleValue(inputs.subject, workflow, run)) ||
            "Tiêu đề thông báo"}
        </strong>
        <p>
          {String(exampleValue(inputs.message, workflow, run)) ||
            "Nội dung thông báo"}
        </p>
      </section>
    </div>
  );
}
function RecordPicker({
  resource,
  binding,
  workflow,
  node,
  onResource,
  onBinding,
  update = false,
}) {
  return (
    <>
      <FormField label="Đối tượng dữ liệu">
        <select value={resource} onChange={(e) => onResource(e.target.value)}>
          <option value="" disabled>
            Chọn đối tượng
          </option>
          {Object.entries(RESOURCES).map(([id, r]) => (
            <option key={id} value={id}>
              {r.label}
            </option>
          ))}
        </select>
      </FormField>
      <SourceSelect
        label="Chọn dữ liệu cụ thể"
        binding={binding?.kind === "reference" ? binding : null}
        workflow={workflow}
        node={node}
        onChange={onBinding}
        filter={(s) =>
          resource === "ticket"
            ? ["id", "ticketId", "recordId"].includes(s.binding.path)
            : ["workOrderId", "recordId"].includes(s.binding.path)
        }
      />
    </>
  );
}
function WaitConfig({ node, workflow, patch }) {
  const inputs = node.inputs;
  const eventIsData =
    inputs.eventName?.kind === "literal" &&
    inputs.eventName.value === "record.updated";
  const filters = node.filters || [];
  const resourceFilter = filters.find(
    (f) => f.path === "resource" && f.operator === "equals",
  );
  const idFilter = filters.find(
    (f) => f.path === "recordId" && f.operator === "equals",
  );
  const dataEvent = eventIsData && resourceFilter && idFilter;
  const resource = inputs[`filter_${resourceFilter?.id}`]?.value || "";
  function setMode(mode) {
    if (mode === "data")
      patch({
        filters: [
          { id: "resource", path: "resource", operator: "equals" },
          { id: "id", path: "recordId", operator: "equals" },
        ],
        outputPaths: ["resource", "recordId", "record.status"],
        inputs: {
          eventName: literal("record.updated"),
          filter_resource: literal("ticket"),
          filter_id: reference("trigger", "id"),
        },
      });
    else
      patch({
        filters: [],
        outputPaths: [],
        inputs: { eventName: literal("") },
      });
  }
  const extra = filters.filter((f) => f !== resourceFilter && f !== idFilter);
  return (
    <>
      <FormField label="Chờ điều gì?">
        <select
          value={dataEvent ? "data" : "signal"}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="data">Một thay đổi của dữ liệu</option>
          <option value="signal">Một tín hiệu được gửi đến</option>
        </select>
      </FormField>
      {dataEvent ? (
        <>
          <RecordPicker
            resource={resource}
            binding={inputs[`filter_${idFilter?.id}`]}
            workflow={workflow}
            node={node}
            onResource={(value) =>
              patch({
                inputs: {
                  ...inputs,
                  [`filter_${resourceFilter?.id}`]: literal(value),
                  [`filter_${idFilter?.id}`]:
                    value === "ticket"
                      ? reference("trigger", "id")
                      : literal(""),
                },
              })
            }
            onBinding={(b) =>
              patch({ inputs: { ...inputs, [`filter_${idFilter?.id}`]: b } })
            }
          />
          <h3>Đi tiếp khi tất cả điều kiện đúng</h3>
          {extra.map((filter, i) => {
            const field = filter.path.replace(/^record\./, "");
            const choices =
              field === "status"
                ? RESOURCES[resource]?.status
                : field === "priority"
                  ? ["low", "medium", "high", "urgent"]
                  : null;
            const b = inputs[`filter_${filter.id}`];
            return (
              <div className="business-condition" key={filter.id}>
                <FormField label={`Thông tin cần xét ${i + 1}`}>
                  <select
                    value={field}
                    onChange={(e) =>
                      patch({
                        filters: filters.map((f) =>
                          f.id === filter.id
                            ? { ...f, path: `record.${e.target.value}` }
                            : f,
                        ),
                        inputs: {
                          ...inputs,
                          [`filter_${filter.id}`]: literal(""),
                        },
                      })
                    }
                  >
                    <option value="" disabled>
                      Chọn thông tin
                    </option>
                    {(RESOURCES[resource]?.fields || []).map((key) => (
                      <option key={key} value={key}>
                        {fieldLabel(key)}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label={`Điều kiện ${i + 1}`}>
                  <select
                    value={filter.operator}
                    onChange={(e) =>
                      patch({
                        filters: filters.map((f) =>
                          f.id === filter.id
                            ? { ...f, operator: e.target.value }
                            : f,
                        ),
                        inputs: {
                          ...inputs,
                          [`filter_${filter.id}`]: literal(
                            e.target.value === "one-of" ? [] : "",
                          ),
                        },
                      })
                    }
                  >
                    {Object.entries(OPERATORS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </FormField>
                {filter.operator === "one-of" && choices ? (
                  <fieldset className="business-options">
                    <legend>Chọn các giá trị được chấp nhận</legend>
                    {choices.map((value) => (
                      <label key={value}>
                        <input
                          type="checkbox"
                          checked={
                            Array.isArray(b?.value) && b.value.includes(value)
                          }
                          onChange={(e) =>
                            patch({
                              inputs: {
                                ...inputs,
                                [`filter_${filter.id}`]: literal(
                                  e.target.checked
                                    ? [
                                        ...(Array.isArray(b?.value)
                                          ? b.value
                                          : []),
                                        value,
                                      ]
                                    : (b?.value || []).filter(
                                        (v) => v !== value,
                                      ),
                                ),
                              },
                            })
                          }
                        />
                        {VALUES[value]}
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <BusinessBinding
                    label={`Giá trị so sánh ${i + 1}`}
                    binding={b}
                    workflow={workflow}
                    node={node}
                    choices={choices}
                    onChange={(b) =>
                      patch({
                        inputs: { ...inputs, [`filter_${filter.id}`]: b },
                      })
                    }
                  />
                )}
                <button
                  className="btn"
                  onClick={() => {
                    const next = { ...inputs };
                    delete next[`filter_${filter.id}`];
                    patch({
                      filters: filters.filter((f) => f.id !== filter.id),
                      inputs: next,
                    });
                  }}
                >
                  Bỏ điều kiện {i + 1}
                </button>
              </div>
            );
          })}
          <button
            className="btn"
            onClick={() => {
              const filterId = `condition${globalThis.crypto.randomUUID()}`;
              patch({
                filters: [
                  ...filters,
                  { id: filterId, path: "record.status", operator: "equals" },
                ],
                inputs: { ...inputs, [`filter_${filterId}`]: literal("") },
              });
            }}
          >
            <Plus size={14} />
            Thêm điều kiện
          </button>
          <p className="business-hint">
            Chỉ dữ liệu đã chọn ở trên mới được theo dõi. Nếu chưa thêm điều
            kiện, quy trình đi tiếp khi có bất kỳ thay đổi nào của dữ liệu đó.
          </p>
        </>
      ) : (
        <>
          <BusinessBinding
            label="Tên tín hiệu"
            binding={inputs.eventName}
            workflow={workflow}
            node={node}
            onChange={(b) => patch({ inputs: { ...inputs, eventName: b } })}
          />
          <p className="business-hint">
            Bước “Phát một tín hiệu” hoặc thao tác trong ứng dụng gửi tín hiệu
            này để quy trình đi tiếp.
          </p>
          {filters.length > 0 && (
            <p className="business-hint">
              Tín hiệu này có {filters.length} điều kiện tùy chỉnh. Xem Cấu hình
              nâng cao để chỉnh.
            </p>
          )}
        </>
      )}
    </>
  );
}
export function AutomationConfig({ node, workflow, patch, changeAction }) {
  const inputs = node.inputs;
  const resource = inputs.resource?.value || "";
  const field = inputs.field?.value || "";
  return (
    <>
      <FormField label="Bạn muốn tự động làm gì?">
        <select
          value={node.action}
          onChange={(e) => changeAction(e.target.value)}
        >
          {Object.entries(OPERATIONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </FormField>
      {node.action === "wait-event" ? (
        <WaitConfig node={node} workflow={workflow} patch={patch} />
      ) : ["read-record", "update-record"].includes(node.action) ? (
        <>
          <RecordPicker
            resource={resource}
            binding={inputs.recordId}
            workflow={workflow}
            node={node}
            onResource={(resource) =>
              patch({
                outputPaths: RESOURCES[resource].fields,
                inputs: {
                  ...inputs,
                  resource: literal(resource),
                  recordId:
                    resource === "ticket"
                      ? reference("trigger", "id")
                      : literal(""),
                  field: literal(""),
                  value: literal(""),
                },
              })
            }
            onBinding={(b) => patch({ inputs: { ...inputs, recordId: b } })}
          />
          {node.action === "update-record" && (
            <>
              <FormField label="Thông tin cần thay đổi">
                <select
                  value={field}
                  onChange={(e) =>
                    patch({
                      inputs: {
                        ...inputs,
                        field: literal(e.target.value),
                        value: literal(""),
                      },
                    })
                  }
                >
                  <option value="" disabled>
                    Chọn thông tin
                  </option>
                  {(RESOURCES[resource]?.update || []).map((key) => (
                    <option key={key} value={key}>
                      {fieldLabel(key)}
                    </option>
                  ))}
                </select>
              </FormField>
              <BusinessBinding
                label="Giá trị mới"
                binding={inputs.value}
                workflow={workflow}
                node={node}
                choices={
                  field === "priority"
                    ? ["low", "medium", "high", "urgent"]
                    : field === "status"
                      ? ["resolved", "cancelled"]
                      : null
                }
                onChange={(b) => patch({ inputs: { ...inputs, value: b } })}
              />
            </>
          )}
        </>
      ) : node.action === "emit-event" ? (
        <>
          <BusinessBinding
            label="Tên tín hiệu"
            binding={inputs.eventName}
            workflow={workflow}
            node={node}
            onChange={(b) => patch({ inputs: { ...inputs, eventName: b } })}
          />
          <p className="business-hint">
            Các bước đang chờ cùng tín hiệu sẽ được kiểm tra để đi tiếp.
          </p>
          <SignalInformation
            binding={inputs.payload}
            workflow={workflow}
            node={node}
            onChange={(b) => patch({ inputs: { ...inputs, payload: b } })}
          />
        </>
      ) : (
        <>
          {node.action === "set-variable" && (
            <FormField label="Lưu vào thông tin dùng chung">
              <select
                value={node.variableName || ""}
                onChange={(e) => patch({ variableName: e.target.value })}
              >
                <option value="" disabled>
                  Chọn thông tin đã khai báo
                </option>
                {workflow.variables.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.label || v.name}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <BusinessBinding
            label={
              node.action === "log" ? "Nội dung nhật ký" : "Giá trị cần lưu"
            }
            binding={inputs.value}
            workflow={workflow}
            node={node}
            onChange={(b) => patch({ inputs: { ...inputs, value: b } })}
          />
        </>
      )}
    </>
  );
}
export function GeneralConfig({ node, workflow, patch, templates, users }) {
  const set = (key, b) => patch({ inputs: { ...node.inputs, [key]: b } });
  if (node.type === "workorder")
    return (
      <>
        <FormField label="Dùng mẫu công việc">
          <select
            value={node.templateId || ""}
            onChange={(e) => patch({ templateId: e.target.value })}
          >
            <option value="">Tự tạo nội dung</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Giao công việc cho ai?">
          <select
            value={node.assignee}
            onChange={(e) => patch({ assignee: e.target.value })}
          >
            <option value={users.maintainer.id}>{users.maintainer.name}</option>
          </select>
        </FormField>
        <BusinessBinding
          label="Tên công việc"
          binding={node.inputs.title}
          workflow={workflow}
          node={node}
          onChange={(b) => set("title", b)}
        />
        <BusinessBinding
          label="Mức ưu tiên"
          binding={node.inputs.priority}
          workflow={workflow}
          node={node}
          choices={["low", "medium", "high", "urgent"]}
          onChange={(b) => set("priority", b)}
        />
        <BusinessBinding
          label="Ghi chú"
          binding={node.inputs.note}
          workflow={workflow}
          node={node}
          multiline
          onChange={(b) => set("note", b)}
        />
        <p className="business-hint">
          Công việc thuộc yêu cầu đang chạy quy trình. Nếu cần chờ một thay đổi
          sau đó, thêm bước Tự động hóa và chọn “Chờ một thay đổi”.
        </p>
      </>
    );
  if (node.type === "condition")
    return (
      <>
        <BusinessBinding
          label="Thông tin cần kiểm tra"
          binding={node.inputs.left}
          workflow={workflow}
          node={node}
          onChange={(b) => set("left", b)}
        />
        <FormField label="Điều kiện">
          <select
            value={node.operator}
            onChange={(e) => patch({ operator: e.target.value })}
          >
            {Object.entries(OPERATORS)
              .filter(([id]) => id !== "one-of")
              .map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
          </select>
        </FormField>
        <BusinessBinding
          label="Giá trị so sánh"
          binding={node.inputs.right}
          workflow={workflow}
          node={node}
          choices={
            node.inputs.left?.path?.split(".").at(-1) === "priority"
              ? ["low", "medium", "high", "urgent"]
              : null
          }
          number={[">", ">=", "<", "<="].includes(node.operator)}
          onChange={(b) => set("right", b)}
        />
      </>
    );
  if (node.type === "parallel")
    return (
      <>
        <FormField label="Các nhánh sẽ làm gì?">
          <select
            value={node.mode}
            onChange={(e) =>
              patch({
                mode: e.target.value,
                branches: node.branches || ["branch-1", "branch-2"],
              })
            }
          >
            <option value="split">Bắt đầu nhiều nhánh cùng lúc</option>
            <option value="join">Chờ các nhánh gặp nhau rồi đi tiếp</option>
          </select>
        </FormField>
        {node.mode === "split" && (
          <FormField label="Số nhánh">
            <input
              type="number"
              min={2}
              max={6}
              value={node.branches.length}
              onChange={(e) =>
                patch({
                  branches: Array.from(
                    {
                      length: Math.min(6, Math.max(2, Number(e.target.value))),
                    },
                    (_, i) => `branch-${i + 1}`,
                  ),
                })
              }
            />
          </FormField>
        )}
      </>
    );
  return (
    <p className="business-hint">
      Người quản lý sẽ nhận yêu cầu phê duyệt. Nối tiếp hai nhánh “Được duyệt”
      và “Từ chối”. Nếu không nối nhánh Từ chối, yêu cầu sẽ bị hủy khi người
      quản lý từ chối.
    </p>
  );
}

function SignalInformation({ binding, workflow, node, onChange }) {
  const data = binding?.value;
  if (
    binding?.kind !== "literal" ||
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  )
    return (
      <BusinessBinding
        label="Thông tin gửi kèm"
        binding={binding}
        workflow={workflow}
        node={node}
        onChange={onChange}
      />
    );
  return (
    <div>
      <h3>Thông tin gửi kèm (tùy chọn)</h3>
      {Object.entries(data).map(([key, value], i) => (
        <div key={i} className="signal-data-row">
          <input
            aria-label={`Tên thông tin gửi kèm ${i + 1}`}
            value={key}
            onChange={(e) => {
              const newKey = e.target.value;
              if (["__proto__", "constructor", "prototype"].includes(newKey))
                return;
              onChange(
                literal(
                  Object.fromEntries(
                    Object.entries(data).map(([k, v]) => [
                      k === key ? newKey : k,
                      v,
                    ]),
                  ),
                ),
              );
            }}
          />
          {typeof value === "object" ? (
            <span>Dữ liệu ghép</span>
          ) : (
            <input
              aria-label={`Giá trị thông tin gửi kèm ${i + 1}`}
              value={String(value)}
              type={typeof value === "number" ? "number" : "text"}
              onChange={(e) =>
                onChange(
                  literal({
                    ...data,
                    [key]:
                      typeof value === "number"
                        ? Number(e.target.value)
                        : e.target.value,
                  }),
                )
              }
            />
          )}
          <button
            className="icon-btn"
            aria-label={`Bỏ thông tin gửi kèm ${i + 1}`}
            onClick={() =>
              onChange(
                literal(
                  Object.fromEntries(
                    Object.entries(data).filter(([k]) => k !== key),
                  ),
                ),
              )
            }
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        className="btn"
        onClick={() => {
          let index = Object.keys(data).length + 1;
          while (Object.hasOwn(data, `thongTin${index}`)) index++;
          onChange(literal({ ...data, [`thongTin${index}`]: "" }));
        }}
      >
        <Plus size={14} />
        Thêm thông tin gửi kèm
      </button>
    </div>
  );
}
export function SignalTester({ run, send }) {
  return (
    <div>
      {run.workflow.nodes
        .filter(
          (n) =>
            n.action === "wait-event" &&
            run.nodeStates[n.id]?.status === "waiting" &&
            run.nodeStates[n.id].inputs.eventName !== "record.updated",
        )
        .map((n) => (
          <div className="test-event" key={n.id}>
            <span>
              {n.title}
              <small>
                Đang chờ tín hiệu: {run.nodeStates[n.id].inputs.eventName}
              </small>
            </span>
            {(n.filters || []).length ? (
              <span>Chỉnh thông tin thử trong Cấu hình nâng cao.</span>
            ) : (
              <button
                className="btn"
                onClick={() =>
                  send("EMIT_EVENT", {
                    name: run.nodeStates[n.id].inputs.eventName,
                    payload: {},
                  })
                }
              >
                Gửi tín hiệu thử
              </button>
            )}
          </div>
        ))}
    </div>
  );
}
