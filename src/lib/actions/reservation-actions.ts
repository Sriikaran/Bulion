"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  CreateRateReservationSchema,
  CancelRateReservationSchema,
  ConsumeRateReservationSchema,
  type CreateRateReservationInput,
  type CancelRateReservationInput,
  type ConsumeRateReservationInput,
} from "@/lib/validations/reservation";
import {
  createRateReservation,
  consumeRateReservation,
  cancelRateReservation,
  getReservationsForTransaction,
} from "@/lib/services/reservation-service";
import { serializeForClient } from "@/lib/utils/serialize";

export async function createRateReservationAction(input: CreateRateReservationInput) {
  try {
    const user = await requireUser();
    const validated = CreateRateReservationSchema.parse(input);

    const reservation = await createRateReservation(user.id, user.role, validated);

    revalidatePath("/purchases");
    revalidatePath("/sales");
    revalidatePath("/reports/rate-reservations");

    return {
      success: true as const,
      data: serializeForClient(reservation),
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to create rate reservation",
    };
  }
}

export async function consumeRateReservationAction(input: ConsumeRateReservationInput) {
  try {
    const user = await requireUser();
    const validated = ConsumeRateReservationSchema.parse(input);

    const reservation = await consumeRateReservation(user.id, user.role, validated);

    revalidatePath("/purchases");
    revalidatePath("/sales");
    revalidatePath("/reports/rate-reservations");
    revalidatePath("/reports/purchases");
    revalidatePath("/reports/sales");

    return {
      success: true as const,
      data: serializeForClient(reservation),
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to consume rate reservation",
    };
  }
}

export async function cancelRateReservationAction(input: CancelRateReservationInput) {
  try {
    const user = await requireUser();
    const validated = CancelRateReservationSchema.parse(input);

    const reservation = await cancelRateReservation(user.id, user.role, validated);

    revalidatePath("/purchases");
    revalidatePath("/sales");
    revalidatePath("/reports/rate-reservations");

    return {
      success: true as const,
      data: serializeForClient(reservation),
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to cancel rate reservation",
    };
  }
}

export async function getReservationsForTransactionAction(
  type: "PURCHASE" | "SALE",
  transactionId: string,
) {
  try {
    await requireUser();
    const list = await getReservationsForTransaction(type, transactionId);
    return {
      success: true as const,
      data: serializeForClient(list),
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to fetch reservations",
    };
  }
}
