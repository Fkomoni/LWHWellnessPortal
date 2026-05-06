export type PrescriptionStatus =
  | 'SENT_TO_PHARMACY'
  | 'PICKED_UP'
  | 'NOT_PICKED'
  | 'AT_RISK'
  | 'RE_ROUTING'
  | 'CANCELLED'
  | 'ESCALATED'
  | 'FRAUD_FLAGGED';

export type PrescriptionEventType =
  | 'CREATED'
  | 'TRIGGER_SENT'
  | 'RETRY_SENT'
  | 'MEMBER_RESPONSE'
  | 'STATUS_CHANGE'
  | 'REROUTE_REQUESTED'
  | 'CANCEL_REQUESTED'
  | 'FRAUD_FLAG'
  | 'DETAILS_RESENT'
  | 'ESCALATED_TO_CALL_CENTER';

export interface Medication {
  name: string;
  qty?: string | number;
  dosage?: string;
}

export interface PrescriptionEvent {
  id: string;
  type: PrescriptionEventType;
  channel?: 'WHATSAPP' | 'EMAIL' | 'IN_APP' | null;
  payload?: Record<string, unknown> | null;
  staffId?: string | null;
  createdAt: string;
}

export interface Prescription {
  id: string;
  prescriptionRef: string;
  memberRef: string;
  memberFirstName: string;
  memberLastName: string;
  memberPhone: string;
  memberEmail: string | null;
  pharmacyName: string;
  pharmacyAddress: string;
  pharmacyPhone: string | null;
  otp: string;
  medications: Medication[];
  status: PrescriptionStatus;
  sentToPharmacyAt: string;
  triggerSentAt: string | null;
  retrySentAt: string | null;
  lastResponseAt: string | null;
  lastResponseChoice: string | null;
  cancelReason: string | null;
  rerouteReason: string | null;
  pickedUpAt: string | null;
  flagged: boolean;
  flagReason: string | null;
  createdAt: string;
  updatedAt: string;
  events?: PrescriptionEvent[];
}

export type ResponseChoice =
  | 'RESEND_DETAILS'
  | 'PICK_LATER'
  | 'CHANGE_PHARMACY'
  | 'CANCEL'
  | 'REROUTE_REASON_UNAVAILABLE'
  | 'REROUTE_REASON_TOO_FAR'
  | 'REROUTE_PROCEED'
  | 'REROUTE_KEEP'
  | 'CANCEL_REASON_NOT_NEEDED'
  | 'CANCEL_REASON_NEVER_REQUESTED'
  | 'CANCEL_REASON_GOT_ELSEWHERE'
  | 'CANCEL_REASON_OTHER'
  | 'CANCEL_CONFIRM_YES'
  | 'CANCEL_CONFIRM_NO';
