/** Fixed product policy shared by the coordination core and its transport adapters. */
export const conversationAttachmentPolicy = {
  maximumAttachments: 20,
  maximumTotalBytes: 512 * 1024 * 1024,
} as const;
