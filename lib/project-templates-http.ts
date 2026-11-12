import { z } from "zod";
export const fromTemplateSchema = z.object({ templateId: z.string().min(1), name: z.string().trim().max(100).optional(), color: z.string().max(16).optional(), description: z.string().max(500).nullable().optional() });
export const saveTemplateSchema = z.object({ name: z.string().trim().max(100).optional(), description: z.string().max(500).nullable().optional() });
