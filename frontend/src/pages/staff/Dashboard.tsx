import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { staffApi } from '../../lib/staffApi';
import { useStaffAuthStore } from '../../store/staffAuthStore';
import {
  Prescription,
  PrescriptionStatus,
  ResponseChoice,
} from '../../types/staff';

const COLORS = {
  red: '#C61531',
  redHover: '#A00F25',
  charcoal: '#263626',
  ink: '#1A1D1A',
  ink2: '#4A554A',
  muted: '#7B847B',
  muted2: '#B0B8B0',
  line: '#E8EAE8',
  line2: '#D3D6D3',
  bg: '#F3F4F3',
  bg2: '#F8F9F8',
  white: '#FFFFFF',
  success: '#0A7A42',
  successBg: '#E6F4EC',
  warn: '#E0910A',
  warnBg: '#FDF3DF',
  danger: '#C61531',
  dangerBg: '#FBE8EC',
  info: '#2966DE',
  infoBg: '#E6EEFB',
  orange: '#F15A24',
  yellow: '#FFCE07',
};
const FONT = 'Poppins, -apple-system, Segoe UI, system-ui, sans-serif';

const STATUS_META: Record<
  PrescriptionStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  SENT_TO_PHARMACY: { label: 'Sent to pharmacy', color: COLORS.info, bg: COLORS.infoBg, border: COLORS.info },
  PICKED_UP:        { label: 'Picked up',        color: COLORS.success, bg: COLORS.successBg, border: COLORS.success },
  NOT_PICKED:       { label: 'Not picked',       color: COLORS.warn,    bg: COLORS.warnBg,    border: COLORS.warn },
  AT_RISK:          { label: 'At risk',          color: COLORS.orange,  bg: '#FFE9DD',        border: COLORS.orange },
  RE_ROUTING:       { label: 'Re-routing',       color: COLORS.info,    bg: COLORS.infoBg,    border: COLORS.info },
  CANCELLED:        { label: 'Cancelled',        color: COLORS.muted,   bg: '#ECEEEC',        border: COLORS.muted },
  ESCALATED:        { label: 'Escalated',        color: COLORS.danger,  bg: COLORS.dangerBg,  border: COLORS.danger },
  FRAUD_FLAGGED:    { label: 'Fraud flag',       color: COLORS.danger,  bg: COLORS.dangerBg,  border: COLORS.danger },
};

function StatusPill({ status }: { status: PrescriptionStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center font-semibold"
      style={{
        background: m.bg,
        color: m.color,
        fontSize: 11.5,
        padding: '3px 10px',
        borderRadius: 999,
        letterSpacing: '.01em',
      }}
    >
      {m.label}
    </span>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div
      className="bg-white"
      style={{
        border: `1px solid ${COLORS.line}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 1px 2px rgba(16,24,40,.06)',
      }}
    >
      <div
        style={{
          color: COLORS.muted,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: COLORS.ink,
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: '-.03em',
          fontVariantNumeric: 'tabular-nums',
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const FILTERS: Array<{ key: PrescriptionStatus | 'ALL'; label: string }> = [
  { key: 'ALL',              label: 'All' },
  { key: 'NOT_PICKED',       label: 'Not picked' },
  { key: 'AT_RISK',          label: 'At risk' },
  { key: 'RE_ROUTING',       label: 'Re-routing' },
  { key: 'PICKED_UP',        label: 'Picked up' },
  { key: 'CANCELLED',        label: 'Cancelled' },
  { key: 'FRAUD_FLAGGED',    label: 'Fraud flag' },
];

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function hoursSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.floor(ms / 60_000)} min`;
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export default function StaffDashboard() {
  const navigate = useNavigate();
  const { staff, logout } = useStaffAuthStore();
  const [filter, setFilter] = useState<PrescriptionStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Prescription[]>([]);
  const [kpi, setKpi] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Prescription | null>(null);
  const [busy, setBusy] = useState(false);
  const [convStep, setConvStep] = useState<'ROOT' | 'REROUTE_REASON' | 'REROUTE_TOO_FAR' | 'CANCEL_REASON' | 'CANCEL_CONFIRM'>('ROOT');

  const load = useCallback(async () => {
    const params: Record<string, string> = {};
    if (filter !== 'ALL') params.status = filter;
    if (search.trim()) params.q = search.trim();
    const { data } = await staffApi.get<{ items: Prescription[]; kpi: Record<string, number> }>(
      '/prescriptions',
      { params },
    );
    setItems(data.items);
    setKpi(data.kpi);
    if (selected) {
      const fresh = data.items.find((p) => p.id === selected.id);
      if (fresh) {
        // Keep events from previous selection if not present in list endpoint.
        setSelected({ ...fresh, events: selected.events });
      }
    }
  }, [filter, search, selected]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh every 60s
  useEffect(() => {
    const t = setInterval(() => load().catch(() => undefined), 60_000);
    return () => clearInterval(t);
  }, [load]);

  async function openDetails(p: Prescription) {
    setConvStep('ROOT');
    const { data } = await staffApi.get<{ prescription: Prescription }>(`/prescriptions/${p.id}`);
    setSelected(data.prescription);
  }

  async function respond(choice: ResponseChoice) {
    if (!selected) return;
    setBusy(true);
    try {
      const { data } = await staffApi.post<{ prescription: Prescription }>(
        `/prescriptions/${selected.id}/respond`,
        { choice },
      );
      setSelected(data.prescription);
      // Step machine
      if (choice === 'CHANGE_PHARMACY') setConvStep('REROUTE_REASON');
      else if (choice === 'REROUTE_REASON_TOO_FAR') setConvStep('REROUTE_TOO_FAR');
      else if (choice === 'CANCEL') setConvStep('CANCEL_REASON');
      else if (choice.startsWith('CANCEL_REASON_')) setConvStep('CANCEL_CONFIRM');
      else setConvStep('ROOT');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function markPickedUp() {
    if (!selected) return;
    setBusy(true);
    try {
      await staffApi.post(`/prescriptions/${selected.id}/mark-picked-up`);
      const { data } = await staffApi.get<{ prescription: Prescription }>(`/prescriptions/${selected.id}`);
      setSelected(data.prescription);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function runSweep() {
    setBusy(true);
    try {
      await staffApi.post('/prescriptions/run-sweep');
      await load();
    } finally {
      setBusy(false);
    }
  }

  const totals = useMemo(
    () => ({
      total: items.length,
      notPicked: kpi['NOT_PICKED'] ?? 0,
      atRisk: kpi['AT_RISK'] ?? 0,
      pickedUp: kpi['PICKED_UP'] ?? 0,
    }),
    [items, kpi],
  );

  return (
    <div style={{ fontFamily: FONT, background: COLORS.bg, minHeight: '100vh', color: COLORS.ink }}>
      {/* Top bar */}
      <header
        className="flex items-center justify-between"
        style={{
          height: 60,
          background: COLORS.white,
          borderBottom: `1px solid ${COLORS.line}`,
          padding: '0 28px',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: COLORS.red,
              color: '#fff',
              fontWeight: 800,
              display: 'grid',
              placeItems: 'center',
              fontSize: 13,
            }}
          >
            LW
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.charcoal }}>
            Pickup Tracking — Staff Portal
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div style={{ fontSize: 12.5, color: COLORS.ink2 }}>
            {staff?.fullName} · <span style={{ color: COLORS.muted }}>{staff?.role}</span>
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/staff/login', { replace: true });
            }}
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: COLORS.red,
              background: 'transparent',
              border: `1px solid ${COLORS.line2}`,
              borderRadius: 8,
              padding: '6px 12px',
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main style={{ padding: '24px 28px' }}>
        {/* KPI grid */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <KpiCard label="Open prescriptions" value={totals.total} accent={COLORS.info} />
          <KpiCard label="Not picked" value={totals.notPicked} accent={COLORS.warn} />
          <KpiCard label="At risk" value={totals.atRisk} accent={COLORS.orange} />
          <KpiCard label="Picked up" value={totals.pickedUp} accent={COLORS.success} />
        </section>

        {/* Filters + search */}
        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 16 }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: `1px solid ${active ? COLORS.red : COLORS.line2}`,
                  background: active ? 'rgba(198,21,49,0.08)' : COLORS.white,
                  color: active ? COLORS.red : COLORS.ink2,
                  transition: 'all 120ms cubic-bezier(.22,.61,.36,1)',
                }}
              >
                {f.label}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Search ref, member, pharmacy…"
            style={{
              height: 36,
              borderRadius: 8,
              border: `1px solid ${COLORS.line2}`,
              padding: '0 12px',
              fontSize: 13,
              minWidth: 280,
              background: COLORS.white,
            }}
          />
          <button
            onClick={runSweep}
            disabled={busy}
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              padding: '8px 14px',
              borderRadius: 10,
              background: COLORS.red,
              color: '#fff',
              border: 'none',
              opacity: busy ? 0.6 : 1,
            }}
          >
            Run T+6h sweep
          </button>
        </div>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: selected ? 'minmax(0, 1.4fr) minmax(420px, 1fr)' : '1fr',
            gap: 16,
          }}
        >
          {/* Table */}
          <div
            style={{
              background: COLORS.white,
              border: `1px solid ${COLORS.line}`,
              borderRadius: 12,
              boxShadow: '0 1px 2px rgba(16,24,40,.06)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: 16,
                borderBottom: `1px solid ${COLORS.line}`,
                fontSize: 14,
                fontWeight: 700,
                color: COLORS.charcoal,
              }}
            >
              Prescriptions
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: COLORS.bg2 }}>
                    {['Ref', 'Member', 'Pharmacy', 'Sent', 'Age', 'Status'].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left',
                          padding: '10px 14px',
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: '.06em',
                          textTransform: 'uppercase',
                          color: COLORS.muted,
                          borderBottom: `1px solid ${COLORS.line}`,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: COLORS.muted, fontSize: 13 }}>
                        No prescriptions match this view.
                      </td>
                    </tr>
                  )}
                  {items.map((p) => {
                    const isSelected = selected?.id === p.id;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => openDetails(p)}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(198,21,49,0.04)' : 'transparent',
                          borderBottom: `1px solid ${COLORS.line}`,
                          transition: 'background 120ms',
                        }}
                      >
                        <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                          {p.prescriptionRef}
                          {p.flagged && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 10.5,
                                fontWeight: 700,
                                color: COLORS.danger,
                                background: COLORS.dangerBg,
                                padding: '2px 6px',
                                borderRadius: 6,
                              }}
                            >
                              FLAG
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13 }}>
                          <div style={{ color: COLORS.ink, fontWeight: 500 }}>
                            {p.memberFirstName} {p.memberLastName}
                          </div>
                          <div style={{ color: COLORS.muted, fontSize: 11.5 }}>{p.memberPhone}</div>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: COLORS.ink2 }}>
                          {p.pharmacyName}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 12.5, color: COLORS.ink2 }}>
                          {formatTime(p.sentToPharmacyAt)}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 12.5, color: COLORS.ink2, fontVariantNumeric: 'tabular-nums' }}>
                          {hoursSince(p.sentToPharmacyAt)}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <StatusPill status={p.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail panel */}
          {selected && (
            <DetailPanel
              p={selected}
              busy={busy}
              step={convStep}
              onStep={setConvStep}
              onRespond={respond}
              onClose={() => setSelected(null)}
              onMarkPickedUp={markPickedUp}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  variant = 'default',
  disabled,
}: {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
}) {
  const base = {
    fontSize: 12.5,
    fontWeight: 600,
    padding: '8px 14px',
    borderRadius: 10,
    border: '1px solid',
    transition: 'all 120ms cubic-bezier(.22,.61,.36,1)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  } as const;
  const styleMap = {
    default: { ...base, background: COLORS.white, borderColor: COLORS.line2, color: COLORS.ink },
    primary: { ...base, background: COLORS.red, borderColor: COLORS.red, color: '#fff' },
    danger:  { ...base, background: COLORS.dangerBg, borderColor: '#F4C7CF', color: COLORS.red },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={styleMap[variant]}>
      {label}
    </button>
  );
}

function DetailPanel({
  p,
  busy,
  step,
  onStep,
  onRespond,
  onClose,
  onMarkPickedUp,
}: {
  p: Prescription;
  busy: boolean;
  step: 'ROOT' | 'REROUTE_REASON' | 'REROUTE_TOO_FAR' | 'CANCEL_REASON' | 'CANCEL_CONFIRM';
  onStep: (s: 'ROOT' | 'REROUTE_REASON' | 'REROUTE_TOO_FAR' | 'CANCEL_REASON' | 'CANCEL_CONFIRM') => void;
  onRespond: (c: ResponseChoice) => void;
  onClose: () => void;
  onMarkPickedUp: () => void;
}) {
  return (
    <aside
      style={{
        background: COLORS.white,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 12,
        boxShadow: '0 4px 12px rgba(16,24,40,.08)',
        padding: 20,
        height: 'fit-content',
      }}
    >
      <div className="flex items-start justify-between" style={{ marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Prescription
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.charcoal, marginTop: 2 }}>
            {p.prescriptionRef}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={p.status} />
          <button
            onClick={onClose}
            style={{
              border: `1px solid ${COLORS.line2}`,
              background: COLORS.white,
              color: COLORS.muted,
              borderRadius: 8,
              padding: '4px 8px',
              fontSize: 12,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <Field label="Member" value={`${p.memberFirstName} ${p.memberLastName}`} sub={p.memberPhone} />
        <Field label="Member ref" value={p.memberRef} sub={p.memberEmail ?? '—'} />
        <Field label="Pharmacy" value={p.pharmacyName} sub={p.pharmacyAddress} />
        <Field label="Pickup OTP" value={p.otp} mono />
        <Field label="Sent to pharmacy" value={formatTime(p.sentToPharmacyAt)} sub={`${hoursSince(p.sentToPharmacyAt)} ago`} />
        <Field label="Trigger sent" value={formatTime(p.triggerSentAt)} sub={p.retrySentAt ? `Retry: ${formatTime(p.retrySentAt)}` : undefined} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
          Medications
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {p.medications.map((m, i) => (
            <li
              key={i}
              style={{
                fontSize: 13,
                color: COLORS.ink,
                padding: '6px 10px',
                background: COLORS.bg2,
                borderRadius: 8,
                marginBottom: 4,
              }}
            >
              <span style={{ fontWeight: 600 }}>{m.name}</span>
              {m.qty != null && <span style={{ color: COLORS.muted }}> · qty {String(m.qty)}</span>}
              {m.dosage && <span style={{ color: COLORS.muted }}> · {m.dosage}</span>}
            </li>
          ))}
        </ul>
      </div>

      {/* Conversation actions */}
      <div
        style={{
          background: COLORS.bg2,
          border: `1px solid ${COLORS.line}`,
          borderRadius: 10,
          padding: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
          Member response
        </div>
        {step === 'ROOT' && (
          <div className="flex flex-wrap gap-2">
            <ActionButton label="❌ Didn’t get OTP / details" onClick={() => onRespond('RESEND_DETAILS')} disabled={busy} />
            <ActionButton label="⏳ Will pick up later" onClick={() => onRespond('PICK_LATER')} disabled={busy} />
            <ActionButton label="🔄 Change pharmacy" onClick={() => onRespond('CHANGE_PHARMACY')} disabled={busy} />
            <ActionButton label="🛑 Cancel prescription" onClick={() => onRespond('CANCEL')} variant="danger" disabled={busy} />
          </div>
        )}
        {step === 'REROUTE_REASON' && (
          <div className="flex flex-wrap gap-2">
            <ActionButton label="❌ Meds not available" onClick={() => onRespond('REROUTE_REASON_UNAVAILABLE')} disabled={busy} />
            <ActionButton label="📍 Pharmacy too far" onClick={() => onRespond('REROUTE_REASON_TOO_FAR')} disabled={busy} />
            <ActionButton label="← Back" onClick={() => onStep('ROOT')} disabled={busy} />
          </div>
        )}
        {step === 'REROUTE_TOO_FAR' && (
          <div className="flex flex-wrap gap-2">
            <ActionButton label="✅ Cancel & reroute" onClick={() => onRespond('REROUTE_PROCEED')} variant="primary" disabled={busy} />
            <ActionButton label="❌ Keep current pharmacy" onClick={() => onRespond('REROUTE_KEEP')} disabled={busy} />
          </div>
        )}
        {step === 'CANCEL_REASON' && (
          <div className="flex flex-wrap gap-2">
            <ActionButton label="No longer need" onClick={() => onRespond('CANCEL_REASON_NOT_NEEDED')} disabled={busy} />
            <ActionButton label="⚠️ Never requested" onClick={() => onRespond('CANCEL_REASON_NEVER_REQUESTED')} variant="danger" disabled={busy} />
            <ActionButton label="Got elsewhere" onClick={() => onRespond('CANCEL_REASON_GOT_ELSEWHERE')} disabled={busy} />
            <ActionButton label="Other" onClick={() => onRespond('CANCEL_REASON_OTHER')} disabled={busy} />
            <ActionButton label="← Back" onClick={() => onStep('ROOT')} disabled={busy} />
          </div>
        )}
        {step === 'CANCEL_CONFIRM' && (
          <div className="flex flex-wrap gap-2">
            <ActionButton label="✅ Yes, cancel" onClick={() => onRespond('CANCEL_CONFIRM_YES')} variant="primary" disabled={busy} />
            <ActionButton label="❌ No, keep it" onClick={() => onRespond('CANCEL_CONFIRM_NO')} disabled={busy} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
        <ActionButton label="✓ Mark picked up" onClick={onMarkPickedUp} variant="primary" disabled={busy || p.status === 'PICKED_UP'} />
      </div>

      {/* Timeline */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
          Activity
        </div>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {(p.events ?? []).map((e) => (
            <li
              key={e.id}
              style={{
                paddingLeft: 12,
                borderLeft: `2px solid ${COLORS.line}`,
                marginBottom: 10,
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>
                {e.type.replaceAll('_', ' ')}
                {e.channel && (
                  <span style={{ color: COLORS.muted, fontWeight: 500 }}> · {e.channel}</span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.muted }}>{formatTime(e.createdAt)}</div>
              {e.payload && (
                <div style={{ fontSize: 12, color: COLORS.ink2, marginTop: 2 }}>
                  {Object.entries(e.payload)
                    .filter(([k]) => k !== 'whatsapp')
                    .map(([k, v]) => (
                      <span key={k} style={{ marginRight: 8 }}>
                        <span style={{ color: COLORS.muted }}>{k}:</span> {String(v)}
                      </span>
                    ))}
                </div>
              )}
            </li>
          ))}
          {(!p.events || p.events.length === 0) && (
            <li style={{ fontSize: 12.5, color: COLORS.muted }}>No activity yet.</li>
          )}
        </ol>
      </div>
    </aside>
  );
}

function Field({
  label,
  value,
  sub,
  mono,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: mono ? 16 : 13,
          fontWeight: mono ? 800 : 600,
          color: COLORS.ink,
          fontFamily: mono ? 'ui-monospace, SF Mono, monospace' : undefined,
          letterSpacing: mono ? '.04em' : undefined,
          marginTop: 2,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 1 }}>{sub}</div>
      )}
    </div>
  );
}
