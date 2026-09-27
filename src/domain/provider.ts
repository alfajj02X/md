/**
 * Provider KYC lifecycle and payment/ledger domain types.
 */

/** KYC lifecycle. Approval comes only from trusted backend/admin authority. */
export type KycStatus =
  | 'not_started'
  | 'submitted'
  | 'under_review'
  | 'changes_required'
  | 'approved'
  | 'rejected'
  | 'suspended';

export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  not_started: 'Not started',
  submitted: 'Submitted',
  under_review: 'Under review',
  changes_required: 'Changes required',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

/** Only approved providers may go online and receive jobs. */
export function canGoOnline(status: KycStatus): boolean {
  return status === 'approved';
}

/** Payment methods supported by the app. */
export type PaymentMethod = 'upi' | 'cash';

/** Authoritative payment states (backend-owned). */
export type PaymentStatus =
  | 'unpaid'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded';

/**
 * Immutable provider ledger entry types. History is never rewritten;
 * corrections use compensating entries.
 */
export type LedgerEntryType =
  | 'service_earning'
  | 'commission'
  | 'cash_collected'
  | 'platform_collection'
  | 'settlement'
  | 'refund_adjustment'
  | 'admin_adjustment'
  | 'bonus'
  | 'penalty';

export interface LedgerEntry {
  id: string;
  providerId: string;
  bookingId: string | null;
  type: LedgerEntryType;
  amountPaise: number;
  /** Signed running effect on the provider's cash liability, in paise. */
  createdAt: string;
  note: string | null;
}
