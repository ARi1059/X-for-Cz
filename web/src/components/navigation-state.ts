export type NavigationFeedback = {
  pendingId: string | null;
  errorId: string | null;
  message: string;
  retryNewTab: boolean;
};

export const idleNavigationFeedback: NavigationFeedback = {
  pendingId: null,
  errorId: null,
  message: '',
  retryNewTab: false,
};
