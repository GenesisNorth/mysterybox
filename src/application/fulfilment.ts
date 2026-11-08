import { moveFulfilment, type Box, type FulfilmentStatus } from "../domain/box.js";

export interface FulfilmentRepository {
  findByBoxNumber(boxNumber: string): Promise<Box | null>;
  assignPrintedCard(box: Box, cardCode: string): Promise<void>;
  saveFulfilmentStatus(box: Box): Promise<void>;
}

export class FulfilmentService {
  constructor(private readonly repository: FulfilmentRepository) {}

  async assignCard(boxNumber: string, cardCode: string): Promise<void> {
    const box = await this.requireBox(boxNumber);
    if (box.fulfilmentStatus !== "paid") throw new Error("Only a paid box can receive a printed card");
    if (!/^GS-CARD-[A-Z0-9]+$/.test(cardCode)) throw new Error("Card code is not valid");
    await this.repository.assignPrintedCard(box, cardCode);
  }

  async advance(boxNumber: string, nextStatus: FulfilmentStatus): Promise<Box> {
    const box = await this.requireBox(boxNumber);
    const advanced = moveFulfilment(box, nextStatus);
    await this.repository.saveFulfilmentStatus(advanced);
    return advanced;
  }

  private async requireBox(boxNumber: string): Promise<Box> {
    const box = await this.repository.findByBoxNumber(boxNumber);
    if (!box) throw new Error("Box not found");
    return box;
  }
}
