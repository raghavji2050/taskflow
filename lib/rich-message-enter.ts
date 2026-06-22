import { Extension } from "@tiptap/core";

/** Chat composer: Enter sends, Shift+Enter inserts a line break. */
export function createChatEnterExtension(onSubmit: () => void) {
  return Extension.create({
    name: "chatSendOnEnter",
    priority: 500,
    addKeyboardShortcuts() {
      return {
        "Shift-Enter": ({ editor }) => editor.commands.setHardBreak(),
        Enter: ({ editor }) => {
          if (editor.isActive("codeBlock")) return false;
          onSubmit();
          return true;
        },
      };
    },
  });
}
