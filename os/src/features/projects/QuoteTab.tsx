import { useId, useRef, useState, type SubmitEvent } from 'react';
import { errorMessage, useAnnouncer } from '../../app/announcer';
import { useResource, useStudio } from '../../app/StudioContext';
import { formatDate, formatDateTime, isIsoDate, israelDate } from '../../domain/dates';
import { ALLOCATION_STATUS_LABEL, allocationRequirement } from '../../domain/invoicing';
import { agorotToInput, formatAgorot, lineNet, parseShekels, quantityToHundredths } from '../../domain/money';
import { PAYMENT_STATE_LABEL, QUOTE_STATUS_LABEL, balanceDue, computeQuoteTotals, paymentState, quoteTotals, validateQuoteForSending } from '../../domain/quote';
import type { Client, Quote, QuoteLine } from '../../domain/types';
import { Icon } from '../../ui/Icon';
import { Badge, Button, EmptyState, ErrorState, Field, LoadingState, Money, describedBy, type Tone } from '../../ui/primitives';
import { useProject } from './ProjectLayout';

interface DraftLine {
  readonly id: string;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
}

function parseQuantity(input: string): number | null {
  const v = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const n = Number(v);
  try {
    quantityToHundredths(n);
  } catch {
    return null;
  }
  return n > 0 ? n : null;
}

/** Pure: draft text rows → valid lines + per-row errors. Exported for tests. */
export function parseDraftLines(rows: readonly DraftLine[]): { lines: QuoteLine[]; errors: Record<string, { quantity?: string; unitPrice?: string }> } {
  const lines: QuoteLine[] = [];
  const errors: Record<string, { quantity?: string; unitPrice?: string }> = {};
  for (const r of rows) {
    const quantity = parseQuantity(r.quantity);
    const unitPrice = parseShekels(r.unitPrice);
    const e: { quantity?: string; unitPrice?: string } = {};
    if (quantity === null) e.quantity = 'כמות חיובית, עד 2 ספרות אחרי הנקודה.';
    if (unitPrice === null) e.unitPrice = 'מחיר בשקלים, למשל 1,500 או 1500.50.';
    if (e.quantity || e.unitPrice) errors[r.id] = e;
    else lines.push({ id: r.id, description: r.description, quantity: quantity as number, unitPrice: unitPrice as number });
  }
  return { lines, errors };
}

const toDraft = (l: QuoteLine): DraftLine => ({ id: l.id, description: l.description, quantity: String(l.quantity), unitPrice: agorotToInput(l.unitPrice) });

function TotalsPanel({ quote, net, vat, total, subtotal, discount, client, today }: { quote: Pick<Quote, 'vatRate'>; net: number; vat: number; total: number; subtotal: number; discount: number; client: Client | null; today: string }) {
  const alloc = allocationRequirement({ docType: 'tax-invoice', net, issueDate: today, toBusiness: Boolean(client?.taxId) });
  return (
    <div className="totals" aria-label="סיכום ההצעה">
      <dl>
        <div className="totals__row">
          <dt>סכום ביניים</dt>
          <dd>
            <Money agorot={subtotal} />
          </dd>
        </div>
        {discount > 0 ? (
          <div className="totals__row">
            <dt>הנחה</dt>
            <dd>
              <Money agorot={-discount} />
            </dd>
          </div>
        ) : null}
        <div className="totals__row">
          <dt>לפני מע״מ</dt>
          <dd>
            <Money agorot={net} />
          </dd>
        </div>
        <div className="totals__row">
          <dt>
            מע״מ <span className="num">{quote.vatRate / 100}%</span>
          </dt>
          <dd>
            <Money agorot={vat} />
          </dd>
        </div>
        <div className="totals__row totals__row--grand">
          <dt>סה״כ כולל מע״מ</dt>
          <dd>
            <output aria-live="polite">
              <Money agorot={total} />
            </output>
          </dd>
        </div>
      </dl>
      <p className="totals__note small">מע״מ מחושב פעם אחת על הסכום שאחרי ההנחה ומעוגל לאגורה הקרובה.</p>
      {alloc.required ? (
        <p className="notice notice--info small">
          <Icon name="alert" size={16} />
          חשבונית מס על הסכום הזה ללקוח עסקי תצטרך מספר הקצאה מרשות המסים (מעל {formatAgorot(alloc.threshold ?? 0, { compact: true })} לפני מע״מ). ספק החשבוניות יבקש אותו בעת ההפקה.
        </p>
      ) : null}
    </div>
  );
}

function DraftEditor({ quote, client }: { quote: Quote; client: Client | null }) {
  const { repos, providers, now } = useStudio();
  const { announce } = useAnnouncer();
  const id = useId();
  const today = israelDate(now());
  const [title, setTitle] = useState(quote.title);
  const [rows, setRows] = useState<DraftLine[]>(() => quote.lines.map(toDraft));
  const [discountText, setDiscountText] = useState(agorotToInput(quote.discount));
  const [validUntil, setValidUntil] = useState(quote.validUntil ?? '');
  const [busy, setBusy] = useState<'save' | 'send' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const seq = useRef(0);

  const { lines, errors } = parseDraftLines(rows);
  const discount = parseShekels(discountText || '0');
  const totals = computeQuoteTotals(lines, discount ?? 0, quote.vatRate);
  const discountError = discount === null ? 'הנחה בשקלים, למשל 500.' : discount > totals.subtotal ? 'ההנחה גדולה מסכום ההצעה.' : null;
  const hasErrors = Object.keys(errors).length > 0 || discountError !== null || (validUntil !== '' && !isIsoDate(validUntil));

  const update = (rowId: string, patch: Partial<DraftLine>) => setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  const addRow = () => {
    seq.current += 1;
    const newId = `ln-${String(Date.now())}-${String(seq.current)}`;
    setRows((rs) => [...rs, { id: newId, description: '', quantity: '1', unitPrice: '0' }]);
    requestAnimationFrame(() => document.getElementById(`${id}-desc-${newId}`)?.focus());
  };
  const removeRow = (rowId: string, index: number) => {
    setRows((rs) => rs.filter((r) => r.id !== rowId));
    announce(`שורה ${String(index + 1)} הוסרה.`);
    requestAnimationFrame(() => document.getElementById(`${id}-add`)?.focus());
  };

  const save = async (): Promise<Quote | null> => {
    setTouched(true);
    if (hasErrors) {
      setFormError('יש שדות לא תקינים. תקנו את המסומנים באדום.');
      return null;
    }
    setFormError(null);
    return repos.quotes.saveDraft(quote.id, { title, lines, discount: discount ?? 0, validUntil: validUntil || null });
  };

  const onSave = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy('save');
    try {
      if (await save()) announce('הטיוטה נשמרה.');
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const onSend = async () => {
    setBusy('send');
    try {
      const saved = await save();
      if (!saved) return;
      const issues = validateQuoteForSending(saved);
      if (issues.length > 0) {
        setFormError(issues.map((i) => i.message).join(' '));
        return;
      }
      if (!client?.email) {
        setFormError('ללקוח אין כתובת אימייל. הוסיפו אחת בכרטיס הלקוח.');
        return;
      }
      const sent = await repos.quotes.setStatus(quote.id, 'sent');
      await providers.email.send({
        to: client.email,
        subject: `הצעת מחיר ${sent.number}: ${sent.title}`,
        text: `שלום ${client.name},\nמצורפת הצעת מחיר על סך ${formatAgorot(quoteTotals(sent).total)} כולל מע״מ.\nAMDIR`,
        tag: 'quote-sent',
      });
      announce(`ההצעה נשלחה (בדמו: נרשמה בתיבת היוצאים) אל ${client.email}.`);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <form className="quote" onSubmit={(e) => void onSave(e)} noValidate aria-labelledby={`${id}-h`}>
      <div className="quote__head">
        <h2 id={`${id}-h`} className="card__title">
          עריכת הצעה <span className="mono">{quote.number}</span>
        </h2>
        <Badge tone="neutral">{QUOTE_STATUS_LABEL[quote.status]}</Badge>
      </div>
      <div className="field-row">
        <Field id={`${id}-title`} label="כותרת" className="grow">
          <input id={`${id}-title`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field id={`${id}-valid`} label="בתוקף עד">
          <input id={`${id}-valid`} className="input" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </Field>
      </div>

      <fieldset className="lines">
        <legend className="lines__legend">שורות</legend>
        <div className="lines__header" aria-hidden="true">
          <span>תיאור</span>
          <span>כמות</span>
          <span>מחיר ליחידה (₪, לפני מע״מ)</span>
          <span className="num-col">סה״כ שורה</span>
          <span />
        </div>
        {rows.length === 0 ? <p className="muted">אין שורות. הוסיפו שורה ראשונה.</p> : null}
        <ol className="lines__list">
          {rows.map((r, i) => {
            const err = touched || r.quantity !== '1' || r.unitPrice !== '0' ? errors[r.id] : undefined;
            const q = parseQuantity(r.quantity);
            const p = parseShekels(r.unitPrice);
            const net = q !== null && p !== null ? lineNet(q, p) : null;
            const n = String(i + 1);
            return (
              <li key={r.id} className="line">
                <Field id={`${id}-desc-${r.id}`} label={<span className="line__label">תיאור שורה {n}</span>} className="line__desc">
                  <input
                    id={`${id}-desc-${r.id}`}
                    className="input"
                    value={r.description}
                    onChange={(e) => update(r.id, { description: e.target.value })}
                    placeholder="למשל: יום צילום"
                  />
                </Field>
                <Field id={`${id}-qty-${r.id}`} label={<span className="line__label">כמות, שורה {n}</span>} error={err?.quantity ?? null} className="line__qty">
                  <input
                    id={`${id}-qty-${r.id}`}
                    className="input num"
                    inputMode="decimal"
                    value={r.quantity}
                    onChange={(e) => update(r.id, { quantity: e.target.value })}
                    aria-invalid={err?.quantity ? true : undefined}
                    aria-describedby={describedBy(`${id}-qty-${r.id}`, { error: err?.quantity })}
                  />
                </Field>
                <Field id={`${id}-price-${r.id}`} label={<span className="line__label">מחיר ליחידה בשקלים, שורה {n}</span>} error={err?.unitPrice ?? null} className="line__price">
                  <input
                    id={`${id}-price-${r.id}`}
                    className="input num"
                    inputMode="decimal"
                    value={r.unitPrice}
                    onChange={(e) => update(r.id, { unitPrice: e.target.value })}
                    aria-invalid={err?.unitPrice ? true : undefined}
                    aria-describedby={describedBy(`${id}-price-${r.id}`, { error: err?.unitPrice })}
                  />
                </Field>
                <p className="line__total num-col">
                  <span className="line__label">סה״כ שורה {n}: </span>
                  {net !== null ? <Money agorot={net} /> : <span className="muted">—</span>}
                </p>
                <button type="button" className="icon-btn" onClick={() => removeRow(r.id, i)}>
                  <Icon name="trash" size={16} />
                  <span className="visually-hidden">הסרת שורה {n}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <Button id={`${id}-add`} size="sm" icon="plus" onClick={addRow}>
          הוספת שורה
        </Button>
      </fieldset>

      <div className="quote__foot">
        <Field id={`${id}-disc`} label="הנחה (₪, לפני מע״מ)" error={discountError} className="quote__discount">
          <input
            id={`${id}-disc`}
            className="input num"
            inputMode="decimal"
            value={discountText}
            onChange={(e) => setDiscountText(e.target.value)}
            aria-invalid={discountError ? true : undefined}
            aria-describedby={describedBy(`${id}-disc`, { error: discountError })}
          />
        </Field>
        <TotalsPanel quote={quote} client={client} today={today} {...totals} />
      </div>

      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}
      <div className="form-actions">
        <Button type="submit" disabled={busy !== null} busy={busy === 'save'}>
          שמירת טיוטה
        </Button>
        <Button variant="primary" icon="outbox" onClick={() => void onSend()} disabled={busy !== null} busy={busy === 'send'}>
          שליחה ללקוח
        </Button>
      </div>
    </form>
  );
}

const PAY_TONE: Record<ReturnType<typeof paymentState>, Tone> = { 'not-due': 'neutral', unpaid: 'danger', partial: 'warn', paid: 'ok' };

function QuoteView({ quote, client }: { quote: Quote; client: Client | null }) {
  const { repos, providers, now } = useStudio();
  const { announce } = useAnnouncer();
  const id = useId();
  const today = israelDate(now());
  const totals = quoteTotals(quote);
  const due = balanceDue(quote);
  const pay = paymentState(quote);
  const [amountText, setAmountText] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      announce(await fn());
    } catch (err) {
      announce(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const status = (to: Quote['status'], msg: string) =>
    run(async () => {
      await repos.quotes.setStatus(quote.id, to);
      return msg;
    });
  const paymentLink = () =>
    run(async () => {
      const link = await providers.payment.createPaymentLink({ reference: quote.number, amount: due, description: quote.title, customerEmail: client?.email ?? null });
      await repos.quotes.attachPaymentLink(quote.id, link.linkId);
      return `נוצר קישור תשלום על ${formatAgorot(due)} (בדמו: נרשם בתיבת היוצאים).`;
    });
  const invoice = () =>
    run(async () => {
      const issued = await providers.invoicing.issue({
        docType: 'tax-invoice',
        reference: quote.number,
        customerName: client?.company ?? client?.name ?? '',
        customerTaxId: client?.taxId ?? null,
        net: totals.net,
        vat: totals.vat,
        issueDate: today,
      });
      await repos.quotes.attachInvoice(quote.id, { ...issued, issuedAt: now() });
      return `הופקה חשבונית ${issued.documentNumber}. ${ALLOCATION_STATUS_LABEL[issued.allocationStatus]}.`;
    });
  const record = async (e: SubmitEvent) => {
    e.preventDefault();
    const amount = parseShekels(amountText);
    if (amount === null || amount <= 0) {
      setAmountError('סכום בשקלים, גדול מאפס.');
      return;
    }
    setAmountError(null);
    await run(async () => {
      await repos.quotes.recordPayment(quote.id, amount);
      setAmountText('');
      return `נרשם תשלום של ${formatAgorot(amount)}.`;
    });
  };

  return (
    <div className="quote">
      <div className="quote__head">
        <h2 className="card__title">
          הצעה <span className="mono">{quote.number}</span> · {quote.title}
        </h2>
        <Badge tone={quote.status === 'accepted' ? 'ok' : quote.status === 'declined' ? 'neutral' : 'info'}>{QUOTE_STATUS_LABEL[quote.status]}</Badge>
        {quote.status === 'accepted' ? <Badge tone={PAY_TONE[pay]}>{PAYMENT_STATE_LABEL[pay]}</Badge> : null}
      </div>
      <p className="muted small num">
        הונפקה {formatDate(quote.issuedOn)}
        {quote.validUntil ? ` · בתוקף עד ${formatDate(quote.validUntil)}` : ''}
        {quote.sentAt ? ` · נשלחה ${formatDateTime(quote.sentAt)}` : ''}
      </p>
      <table className="table">
        <caption className="visually-hidden">שורות ההצעה</caption>
        <thead>
          <tr>
            <th scope="col">תיאור</th>
            <th scope="col" className="num-col">
              כמות
            </th>
            <th scope="col" className="num-col">
              מחיר ליחידה
            </th>
            <th scope="col" className="num-col">
              סה״כ
            </th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.description}</td>
              <td className="num-col num">{l.quantity}</td>
              <td className="num-col">
                <Money agorot={l.unitPrice} />
              </td>
              <td className="num-col">
                <Money agorot={lineNet(l.quantity, l.unitPrice)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="quote__foot">
        <div className="stack">
          {quote.status === 'sent' ? (
            <div className="button-row">
              <Button variant="primary" icon="check" disabled={busy} onClick={() => void status('accepted', 'ההצעה סומנה כאושרה.')}>
                הלקוח אישר
              </Button>
              <Button disabled={busy} onClick={() => void status('declined', 'ההצעה סומנה כנדחתה.')}>
                הלקוח דחה
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => void status('draft', 'ההצעה חזרה לטיוטה.')}>
                חזרה לעריכה
              </Button>
            </div>
          ) : null}
          {quote.status === 'declined' ? (
            <Button disabled={busy} onClick={() => void status('draft', 'ההצעה חזרה לטיוטה.')}>
              עריכה מחדש
            </Button>
          ) : null}
          {quote.status === 'accepted' ? (
            <>
              <dl className="kv kv--compact">
                <div className="kv__row">
                  <dt>שולם</dt>
                  <dd>
                    <Money agorot={quote.paid} />
                  </dd>
                </div>
                <div className="kv__row">
                  <dt>יתרה לתשלום</dt>
                  <dd>
                    <Money agorot={due} className="strong" />
                  </dd>
                </div>
                {quote.paymentLinkId ? (
                  <div className="kv__row">
                    <dt>קישור תשלום</dt>
                    <dd className="mono">{quote.paymentLinkId}</dd>
                  </div>
                ) : null}
              </dl>
              {due > 0 ? (
                <>
                  <div className="button-row">
                    <Button icon="money" disabled={busy} onClick={() => void paymentLink()}>
                      יצירת קישור תשלום
                    </Button>
                  </div>
                  <form className="inline-form" onSubmit={(e) => void record(e)} noValidate aria-label="רישום תשלום">
                    <Field id={`${id}-pay`} label="תשלום שהתקבל (₪)" error={amountError}>
                      <input
                        id={`${id}-pay`}
                        className="input num"
                        inputMode="decimal"
                        value={amountText}
                        onChange={(e) => setAmountText(e.target.value)}
                        placeholder={agorotToInput(due)}
                        aria-invalid={amountError ? true : undefined}
                        aria-describedby={describedBy(`${id}-pay`, { error: amountError })}
                      />
                    </Field>
                    <Button type="submit" disabled={busy}>
                      רישום
                    </Button>
                  </form>
                </>
              ) : null}
              {quote.invoice ? (
                <div className="notice notice--ok small">
                  <Icon name="file" size={16} />
                  <span>
                    חשבונית <span className="mono">{quote.invoice.documentNumber}</span> · {ALLOCATION_STATUS_LABEL[quote.invoice.allocationStatus]}
                    {quote.invoice.allocationNumber ? (
                      <>
                        {' '}
                        · <span className="mono">{quote.invoice.allocationNumber}</span>
                      </>
                    ) : null}
                  </span>
                </div>
              ) : (
                <div className="button-row">
                  <Button icon="file" disabled={busy} onClick={() => void invoice()}>
                    הפקת חשבונית מס
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </div>
        <TotalsPanel quote={quote} client={client} today={today} {...totals} />
      </div>
    </div>
  );
}

export function ProjectQuote() {
  const { project, client } = useProject();
  const { repos } = useStudio();
  const { announce } = useAnnouncer();
  const res = useResource((r) => r.quotes.listByProject(project.id), [project.id]);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      await repos.quotes.createDraft(project.id);
      announce('נוצרה טיוטת הצעה.');
    } catch (err) {
      announce(errorMessage(err), 'error');
    } finally {
      setCreating(false);
    }
  };

  if (res.status === 'loading') return <LoadingState label="טוען הצעת מחיר…" />;
  if (res.status === 'error') return <ErrorState error={res.error} onRetry={res.reload} />;
  const quote = res.data[0];
  if (!quote) {
    return (
      <EmptyState
        icon="money"
        title="אין עדיין הצעת מחיר"
        action={
          <Button variant="primary" icon="plus" onClick={() => void create()} busy={creating} disabled={creating}>
            יצירת טיוטה
          </Button>
        }
      >
        בונים הצעה עם שורות, הנחה ומע״מ מחושב. הסכומים נשמרים באגורות שלמות.
      </EmptyState>
    );
  }
  return (
    <div className="card">
      {quote.status === 'draft' ? <DraftEditor key={quote.id} quote={quote} client={client} /> : <QuoteView quote={quote} client={client} />}
    </div>
  );
}
