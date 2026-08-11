import { z } from "zod";

export const SIZE_OPTIONS = [16, 32, 64, 128] as const;
export const COLOR_OPTIONS = [8, 16, 32] as const;

export const generateRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "Prompt is required")
    .max(500, "Prompt must be 500 characters or fewer")
    .refine((v) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v), {
      message: "Prompt contains invalid control characters",
    }),
  width: z.union([z.literal(16), z.literal(32), z.literal(64), z.literal(128)]),
  height: z.union([z.literal(16), z.literal(32), z.literal(64), z.literal(128)]),
  colors: z.union([z.literal(8), z.literal(16), z.literal(32)]),
  transparent: z.boolean().optional().default(false),
});

export type GenerateRequest = z.infer<typeof generateRequestSchema>;
