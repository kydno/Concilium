import { usageTotal } from "../context";
import type { CouncilEvent } from "../types";
import type { TokenUsage } from "../mercury";

export interface UsageAccumulator {
  total: number;
  add(usage?: TokenUsage | null): number;
  createCouncilHandler(): (event: CouncilEvent) => void;
}

export function createUsageAccumulator(): UsageAccumulator {
  let total = 0;

  return {
    get total() {
      return total;
    },
    add(usage?: TokenUsage | null) {
      const added = usageTotal(usage);
      if (added > 0) total += added;
      return added;
    },
    createCouncilHandler() {
      return (event: CouncilEvent) => {
        if (event.type === "usage") {
          const cumulative = event.data.cumulative_total;
          if (typeof cumulative === "number" && cumulative > 0) {
            total = cumulative;
          } else {
            this.add(event.data);
          }
        }
      };
    },
  };
}
