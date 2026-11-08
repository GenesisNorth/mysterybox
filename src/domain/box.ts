export type FulfilmentStatus =
  | "created"
  | "paid"
  | "packed"
  | "collected"
  | "delivered"
  | "cancelled"
  | "refunded";

export type RecipientStatus = "unknown" | "scanned" | "confirmed" | "registered" | "decided";

export interface Box {
  id: string;
  boxNumber: string;
  trailId: string;
  parentBoxId: string | null;
  depth: number;
  fulfilmentStatus: FulfilmentStatus;
  recipientStatus: RecipientStatus;
}

const nextFulfilmentStates: Record<FulfilmentStatus, readonly FulfilmentStatus[]> = {
  created: ["paid", "cancelled"],
  paid: ["packed", "cancelled", "refunded"],
  packed: ["collected", "cancelled", "refunded"],
  collected: ["delivered"],
  delivered: [],
  cancelled: [],
  refunded: []
};

export function moveFulfilment(box: Box, nextStatus: FulfilmentStatus): Box {
  if (!nextFulfilmentStates[box.fulfilmentStatus].includes(nextStatus)) {
    throw new Error(`Cannot move box ${box.id} from ${box.fulfilmentStatus} to ${nextStatus}`);
  }
  return { ...box, fulfilmentStatus: nextStatus };
}

export function confirmReceipt(box: Box): Box {
  if (box.fulfilmentStatus !== "delivered") {
    throw new Error("A recipient can only confirm a delivered box");
  }
  return { ...box, recipientStatus: "confirmed" };
}

export function createChildBox(input: {
  id: string;
  boxNumber: string;
  parent: Box;
}): Box {
  if (input.parent.fulfilmentStatus === "cancelled" || input.parent.fulfilmentStatus === "refunded") {
    throw new Error("A cancelled or refunded box cannot be continued");
  }
  return {
    id: input.id,
    boxNumber: input.boxNumber,
    trailId: input.parent.trailId,
    parentBoxId: input.parent.id,
    depth: input.parent.depth + 1,
    fulfilmentStatus: "created",
    recipientStatus: "unknown"
  };
}
