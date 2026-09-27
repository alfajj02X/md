import { create } from 'zustand';

/**
 * Draft state for the multi-step customer booking flow:
 * service → address → slot → summary → payment.
 * Lives only in memory; the booking is created server-side on confirm.
 */
interface BookingDraft {
  serviceId: string | null;
  addressId: string | null;
  scheduledAt: string | null;
  notes: string;
  setService: (id: string) => void;
  setAddress: (id: string) => void;
  setSlot: (iso: string) => void;
  setNotes: (notes: string) => void;
  reset: () => void;
  /** True when the draft can proceed to the payment step. */
  isReady: () => boolean;
}

const initial = {
  serviceId: null as string | null,
  addressId: null as string | null,
  scheduledAt: null as string | null,
  notes: '',
};

export const useBookingDraft = create<BookingDraft>((set, get) => ({
  ...initial,
  setService: (serviceId) => set({ serviceId }),
  setAddress: (addressId) => set({ addressId }),
  setSlot: (scheduledAt) => set({ scheduledAt }),
  setNotes: (notes) => set({ notes }),
  reset: () => set(initial),
  isReady: () => Boolean(get().serviceId && get().addressId && get().scheduledAt),
}));
