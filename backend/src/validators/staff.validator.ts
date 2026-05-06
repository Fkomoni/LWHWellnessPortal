import { z } from 'zod';

export const staffLoginSchema = z.object({
  email: z.string().email('Enter a valid staff email').toLowerCase(),
  password: z.string().min(1, 'Password is required').max(128),
});

export const respondPrescriptionSchema = z.object({
  choice: z.enum([
    'RESEND_DETAILS',
    'PICK_LATER',
    'CHANGE_PHARMACY',
    'CANCEL',
    'REROUTE_REASON_UNAVAILABLE',
    'REROUTE_REASON_TOO_FAR',
    'REROUTE_PROCEED',
    'REROUTE_KEEP',
    'CANCEL_REASON_NOT_NEEDED',
    'CANCEL_REASON_NEVER_REQUESTED',
    'CANCEL_REASON_GOT_ELSEWHERE',
    'CANCEL_REASON_OTHER',
    'CANCEL_CONFIRM_YES',
    'CANCEL_CONFIRM_NO',
  ]),
  note: z.string().max(500).optional(),
});

export const createPrescriptionSchema = z.object({
  prescriptionRef: z.string().min(3).max(80),
  memberRef: z.string().min(1).max(50),
  memberFirstName: z.string().min(1).max(80),
  memberLastName: z.string().min(1).max(80),
  memberPhone: z.string().min(7).max(20),
  memberEmail: z.string().email().optional(),
  pharmacyName: z.string().min(1).max(120),
  pharmacyAddress: z.string().min(1).max(255),
  pharmacyPhone: z.string().min(7).max(20).optional(),
  otp: z.string().min(3).max(12),
  medications: z
    .array(
      z.object({
        name: z.string(),
        qty: z.union([z.string(), z.number()]).optional(),
        dosage: z.string().optional(),
      }),
    )
    .min(1),
  // Optional override (testing): when this prescription was sent to the pharmacy.
  sentToPharmacyAt: z.coerce.date().optional(),
});
