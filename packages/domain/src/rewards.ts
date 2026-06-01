export type RewardRedemption = {
  id: string;
  householdId: string;
  personId: string;
  title: string;
  pointsSpent: number;
  redeemedAt: string;
};

export type RewardBalance = {
  personId: string;
  displayName: string;
  earnedPoints: number;
  spentPoints: number;
  balance: number;
};
