export enum LoanStatus {
  ACTIVE = 'active',
  RETURNED = 'returned',
  OVERDUE = 'overdue',
  LOST = 'lost',
}

export const ALLOWED_TRANSITIONS: Record<LoanStatus, LoanStatus[]> = {
  [LoanStatus.ACTIVE]: [LoanStatus.RETURNED, LoanStatus.OVERDUE, LoanStatus.LOST],
  [LoanStatus.OVERDUE]: [LoanStatus.RETURNED, LoanStatus.LOST],
  [LoanStatus.RETURNED]: [],
  [LoanStatus.LOST]: [],
};
