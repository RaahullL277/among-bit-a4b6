import type { StockStatus } from '@prisma/client';

/**
 * Inputs a scorer needs to rate a single variant's stock health.
 * `dailyVelocity` is units sold per day over the policy's trailing window.
 */
export interface StockSignal {
  inventory: number;
  dailyVelocity: number;
  greenDays: number;
  amberDays: number;
  reorderPoint: number;
}

export interface StockScore {
  status: StockStatus;
  /** Estimated days until stock-out; null when there is no sales velocity. */
  daysOfCover: number | null;
  reason: string;
}

/**
 * Pluggable scorer. The heuristic below ships today; an ML demand-forecasting
 * model can implement this same interface later with no call-site changes.
 */
export interface StockScorer {
  score(signal: StockSignal): StockScore;
}

export class HeuristicStockScorer implements StockScorer {
  score(signal: StockSignal): StockScore {
    const { inventory, dailyVelocity, greenDays, amberDays, reorderPoint } = signal;

    if (inventory <= 0) {
      return { status: 'RED', daysOfCover: 0, reason: 'out_of_stock' };
    }
    if (inventory <= reorderPoint) {
      return { status: 'RED', daysOfCover: null, reason: 'at_or_below_reorder_point' };
    }

    // No sales in the window → cover is effectively unbounded.
    if (dailyVelocity <= 0) {
      return { status: 'GREEN', daysOfCover: null, reason: 'no_recent_sales' };
    }

    const daysOfCover = inventory / dailyVelocity;
    if (daysOfCover < amberDays) {
      return { status: 'RED', daysOfCover, reason: 'below_amber_threshold' };
    }
    if (daysOfCover < greenDays) {
      return { status: 'AMBER', daysOfCover, reason: 'below_green_threshold' };
    }
    return { status: 'GREEN', daysOfCover, reason: 'healthy' };
  }
}

export const defaultStockScorer: StockScorer = new HeuristicStockScorer();
