"use client";

import { SendHorizontal } from "lucide-react";
import { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading?: boolean;
};

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading = false,
}: ChatInputProps) {
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="flex items-end gap-3 rounded-2xl border border-slate-700/70 bg-[#0f1730]/85 p-3 backdrop-blur-sm">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder="Postavite pravno pitanje na srpskom..."
        className="max-h-40 min-h-[58px] flex-1 resize-y border-none bg-transparent focus-visible:ring-0"
        disabled={isLoading}
      />
      <Button
        type="button"
        onClick={onSubmit}
        disabled={isLoading || !value.trim()}
        className="h-10 w-10 rounded-xl p-0"
      >
        <SendHorizontal className="h-4 w-4" />
      </Button>
    </div>
  );
}
