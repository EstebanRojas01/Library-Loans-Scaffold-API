export enum LoanStatus {
  ACTIVE = 'active',
  RETURNED = 'returned',
  OVERDUE = 'overdue',
}

export const ALLOWED_TRANSITIONS: Record<LoanStatus, LoanStatus[]> = {
  [LoanStatus.ACTIVE]: [LoanStatus.RETURNED, LoanStatus.OVERDUE],
  [LoanStatus.OVERDUE]: [LoanStatus.RETURNED],
  [LoanStatus.RETURNED]: [],
};
