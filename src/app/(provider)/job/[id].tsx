import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { GEOFENCE_RADIUS_METERS } from '@/domain/config';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  OTPInput,
  Screen,
  Skeleton,
  TextField,
} from '@/ui/components';
import { colors, spacing, typography } from '@/ui/theme';
import { BOOKING_STATUS_TONE, bookingStatusLabel } from '@/lib/bookingUi';
import { paiseToDisplay, rupeesToPaise, totalItemized } from '@/domain/money';
import { maskPhone } from '@/domain/validators';
import {
  formatSlot,
  getHighAccuracyPosition,
  markArrived,
  markOnTheWay,
  recordCashPayment,
  submitFinalAmount,
  useBookingLedger,
  useJob,
  verifyStartOtp,
  type ItemizedPaise,
  type JobDetail,
} from '@/lib/provider';
import { useQueryClient } from '@tanstack/react-query';
import { providerKeys } from '@/lib/provider';

/**
 * Job lifecycle screen. Every step is driven by booking.status and performed
 * through the guarded RPCs — the client never writes the booking row.
 */
export default function ProviderJobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, isLoading, isError, refetch } = useJob(id);
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: providerKeys.job(id ?? '') });

  if (isLoading) {
    return (
      <Screen>
        <Skeleton height={160} />
        <Skeleton height={220} />
      </Screen>
    );
  }
  if (isError || !job) {
    return (
      <Screen>
        <ErrorState title="Could not load this job" onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <JobHeader job={job} />
      <JobAction job={job} onChanged={invalidate} />
    </Screen>
  );
}

function JobHeader({ job }: { job: JobDetail }) {
  const address = job.address;
  return (
    <Card style={styles.header}>
      <View style={styles.headerRow}>
        <Text style={styles.serviceName}>{job.service?.name ?? 'Service'}</Text>
        <Badge label={bookingStatusLabel(job.status)} tone={BOOKING_STATUS_TONE[job.status]} />
      </View>
      <Text style={styles.meta}>{formatSlot(job.scheduled_at)}</Text>
      {job.customer ? (
        <Text style={styles.meta}>
          {job.customer.display_name ?? 'Customer'}
          {job.customer.phone ? ` · ${maskPhone(job.customer.phone)}` : ''}
        </Text>
      ) : null}
      {address ? (
        <Text style={styles.address}>
          {[address.line1, address.line2, address.landmark, address.locality, address.city, address.pincode]
            .filter(Boolean)
            .join(', ')}
        </Text>
      ) : null}
      {job.notes ? <Text style={styles.notes}>Note: {job.notes}</Text> : null}
    </Card>
  );
}

/** Small helper: mutation state machine for job actions. */
function useAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, onDone?: () => void | Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await fn();
      await onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };
  return { loading, error, run, setError };
}

function JobAction({ job, onChanged }: { job: JobDetail; onChanged: () => void }) {
  switch (job.status) {
    case 'assigned':
      return <AssignedAction job={job} onChanged={onChanged} />;
    case 'on_the_way':
      return <ArrivedAction job={job} onChanged={onChanged} />;
    case 'arrived':
    case 'awaiting_start_otp':
      return <StartOtpAction job={job} onChanged={onChanged} />;
    case 'in_service':
      return <FinishServiceAction job={job} onChanged={onChanged} />;
    case 'awaiting_amount_approval':
      return <AwaitingApprovalAction job={job} onChanged={onChanged} />;
    case 'awaiting_payment':
      return <CollectPaymentAction job={job} onChanged={onChanged} />;
    case 'completed':
      return <CompletedSummary job={job} />;
    case 'cancelled':
    case 'rescheduled':
      return (
        <Card>
          <Text style={styles.infoTitle}>{bookingStatusLabel(job.status)}</Text>
          {job.cancel_reason ? <Text style={styles.meta}>Reason: {job.cancel_reason}</Text> : null}
        </Card>
      );
    default:
      return (
        <EmptyState
          title={bookingStatusLabel(job.status)}
          message="No action needed for this job right now."
        />
      );
  }
}

function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text style={styles.errorText} accessibilityRole="alert">
      {message}
    </Text>
  );
}

function AssignedAction({ job, onChanged }: { job: JobDetail; onChanged: () => void }) {
  const { loading, error, run } = useAction();
  return (
    <Card style={styles.action}>
      <Text style={styles.actionTitle}>Head to the customer</Text>
      <Text style={styles.meta}>
        Tap below when you start travelling. The customer will be notified.
      </Text>
      <ActionError message={error} />
      <Button
        title="On the way"
        onPress={() => run(() => markOnTheWay(job.id), onChanged)}
        loading={loading}
      />
    </Card>
  );
}

function ArrivedAction({ job, onChanged }: { job: JobDetail; onChanged: () => void }) {
  const { loading, error, run } = useAction();
  const [distance, setDistance] = useState<number | null>(null);

  const onArrived = () =>
    run(async () => {
      const pos = await getHighAccuracyPosition();
      const updated = await markArrived(job.id, pos.latitude, pos.longitude, pos.accuracy);
      setDistance(updated.arrival_distance_m);
    }, onChanged);

  return (
    <Card style={styles.action}>
      <Text style={styles.actionTitle}>Confirm your arrival</Text>
      <Text style={styles.meta}>
        We check your GPS against the customer&apos;s address (within{' '}
        {GEOFENCE_RADIUS_METERS} m). Stand close to the doorstep before tapping.
      </Text>
      {distance !== null ? (
        <Text style={styles.meta}>Verified {Math.round(distance)} m from the address.</Text>
      ) : null}
      <ActionError message={error} />
      <Button title="I've arrived" onPress={onArrived} loading={loading} />
    </Card>
  );
}

function StartOtpAction({ job, onChanged }: { job: JobDetail; onChanged: () => void }) {
  const { loading, error, run, setError } = useAction();
  const [code, setCode] = useState('');

  const onVerify = () => {
    if (code.length !== 6) {
      setError('Enter the 6-digit code the customer reads out.');
      return;
    }
    run(() => verifyStartOtp(job.id, code), onChanged);
  };

  return (
    <Card style={styles.action}>
      <Text style={styles.actionTitle}>Start the service</Text>
      <Text style={styles.meta}>
        {job.status === 'arrived'
          ? 'Ask the customer to generate their 6-digit start code and read it out to you.'
          : 'The customer has the start code. Ask them to read it out to you.'}
      </Text>
      <Text style={styles.meta}>Enter the code the customer reads back:</Text>
      <OTPInput value={code} onChange={setCode} />
      <ActionError message={error} />
      <Button
        title="Verify & start service"
        onPress={onVerify}
        loading={loading}
        disabled={code.length !== 6}
      />
    </Card>
  );
}

function FinishServiceAction({ job, onChanged }: { job: JobDetail; onChanged: () => void }) {
  const { loading, error, run, setError } = useAction();
  const [labour, setLabour] = useState('');
  const [parts, setParts] = useState('');
  const [additional, setAdditional] = useState('');
  const [discount, setDiscount] = useState('');

  const onSubmit = () => {
    let item: ItemizedPaise;
    try {
      item = {
        labourPaise: labour.trim() ? rupeesToPaise(parseFloat(labour)) : 0,
        partsPaise: parts.trim() ? rupeesToPaise(parseFloat(parts)) : 0,
        additionalPaise: additional.trim() ? rupeesToPaise(parseFloat(additional)) : 0,
        discountPaise: discount.trim() ? rupeesToPaise(parseFloat(discount)) : 0,
      };
      totalItemized({
        labourPaise: item.labourPaise,
        partsPaise: item.partsPaise,
        additionalPaise: item.additionalPaise,
        discountPaise: item.discountPaise,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the amounts you entered.');
      return;
    }
    run(() => submitFinalAmount(job.id, item), onChanged);
  };

  const fields: { label: string; value: string; set: (v: string) => void }[] = [
    { label: 'Labour (₹)', value: labour, set: setLabour },
    { label: 'Spare parts (₹)', value: parts, set: setParts },
    { label: 'Additional charges (₹)', value: additional, set: setAdditional },
    { label: 'Discount (₹)', value: discount, set: setDiscount },
  ];

  return (
    <Card style={styles.action}>
      <Text style={styles.actionTitle}>Finish & enter the final amount</Text>
      <Text style={styles.meta}>
        Break down the charges. The customer approves the total before payment.
      </Text>
      {fields.map((f) => (
        <TextField
          key={f.label}
          label={f.label}
          value={f.value}
          onChangeText={(t) => f.set(t.replace(/[^0-9.]/g, ''))}
          placeholder="0"
          keyboardType="numeric"
        />
      ))}
      <ActionError message={error} />
      <Button title="Submit for approval" onPress={onSubmit} loading={loading} />
    </Card>
  );
}

function AwaitingApprovalAction({ job, onChanged }: { job: JobDetail; onChanged: () => void }) {
  const rev = job.pendingRevision;
  return (
    <Card style={styles.action}>
      <Text style={styles.actionTitle}>Waiting for customer approval</Text>
      {rev ? (
        <View style={styles.breakdown}>
          <BreakdownRow label="Labour" paise={rev.labour_paise} />
          <BreakdownRow label="Parts" paise={rev.parts_paise} />
          <BreakdownRow label="Additional" paise={rev.additional_paise} />
          <BreakdownRow label="Discount" paise={-rev.discount_paise} />
          <BreakdownRow label="Total" paise={rev.total_paise} strong />
        </View>
      ) : (
        <Text style={styles.meta}>Your submitted amount is with the customer.</Text>
      )}
      <Text style={styles.meta}>
        You&apos;ll be notified when the customer approves or asks for a revision.
      </Text>
      <Button title="Refresh status" variant="secondary" onPress={onChanged} />
    </Card>
  );
}

function CollectPaymentAction({ job, onChanged }: { job: JobDetail; onChanged: () => void }) {
  const { loading, error, run } = useAction();
  const amount = job.approved_amount_paise ?? 0;

  const onCollectCash = () => {
    Alert.alert(
      'Collect cash',
      `Confirm you collected ${paiseToDisplay(amount)} in cash from the customer.`,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Collected',
          onPress: () => run(() => recordCashPayment(job.id), onChanged),
        },
      ],
    );
  };

  if (job.payment_method === 'cash') {
    return (
      <Card style={styles.action}>
        <Text style={styles.actionTitle}>Collect {paiseToDisplay(amount)} in cash</Text>
        <Text style={styles.meta}>
          Collect the amount from the customer, then confirm below. The commission is
          tracked against your cash liability.
        </Text>
        <ActionError message={error} />
        <Button title="Mark cash collected" onPress={onCollectCash} loading={loading} />
      </Card>
    );
  }

  return (
    <Card style={styles.action}>
      <Text style={styles.actionTitle}>Waiting for UPI payment</Text>
      <Text style={styles.meta}>
        The customer is paying {paiseToDisplay(amount)} online. The job completes
        automatically once the payment is confirmed.
      </Text>
      <Button title="Refresh status" variant="secondary" onPress={onChanged} />
    </Card>
  );
}

function CompletedSummary({ job }: { job: JobDetail }) {
  const { data: entries } = useBookingLedger(job.id);
  const earning = entries?.find((e) => e.type === 'service_earning');
  const commission = entries?.find((e) => e.type === 'commission');
  return (
    <Card style={styles.action}>
      <Text style={styles.actionTitle}>Job completed</Text>
      <View style={styles.breakdown}>
        <BreakdownRow label="Customer paid" paise={job.approved_amount_paise ?? 0} />
        {commission ? <BreakdownRow label="Platform commission" paise={-commission.amount_paise} /> : null}
        {earning ? (
          <BreakdownRow label="Your earning" paise={earning.amount_paise} strong />
        ) : null}
      </View>
      <Text style={styles.meta}>
        {job.payment_method === 'cash'
          ? 'Cash collected. The commission is added to your cash liability.'
          : 'Paid online to the platform account.'}
      </Text>
    </Card>
  );
}

function BreakdownRow({ label, paise, strong }: { label: string; paise: number; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={strong ? styles.rowLabelStrong : styles.rowLabel}>{label}</Text>
      <Text style={strong ? styles.rowValueStrong : styles.rowValue}>
        {paise < 0 ? `−${paiseToDisplay(-paise)}` : paiseToDisplay(paise)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  header: { gap: spacing.xs },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  serviceName: { ...typography.h2, color: colors.text, flex: 1 },
  meta: { ...typography.body, color: colors.textSecondary },
  address: { ...typography.body, color: colors.text },
  notes: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
  action: { gap: spacing.md },
  actionTitle: { ...typography.h3, color: colors.text },
  errorText: { ...typography.small, color: colors.error },
  infoTitle: { ...typography.h3, color: colors.text },
  codeBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  codeLabel: { ...typography.caption, color: colors.textSecondary },
  code: { ...typography.display, color: colors.primaryDark, letterSpacing: 8 },
  breakdown: { gap: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { ...typography.body, color: colors.textSecondary },
  rowLabelStrong: { ...typography.bodyStrong, color: colors.text },
  rowValue: { ...typography.body, color: colors.text },
  rowValueStrong: { ...typography.bodyStrong, color: colors.primaryDark },
});
