"use client";

import { WelcomeHero } from "./WelcomeHero";
import { ChatComposer } from "./ChatComposer";
import { MessageBubble } from "./MessageBubble";
import type { ChatPanelState } from "@/hooks/useChatPanel";

export function ChatPanelContent({
  panel,
  compact,
}: {
  panel: ChatPanelState;
  compact?: boolean;
}) {
  const {
    state,
    isClientMode,
    setCommandPalette,
    input,
    setInput,
    streaming,
    send,
    stop,
    contextLabel,
    zendeskStatus,
    messagesEndRef,
    chatMode,
    chatModeLabel,
    onChatModeChange,
    modeError,
    canUseDeveloperMode,
    pendingAttachments,
    onAttachClick,
    onFilesSelected,
    removePendingAttachment,
    fileInputRef,
  } = panel;

  return (
    <>
      <div
        className={`flex-1 min-h-0 overflow-y-auto ${compact ? "px-4 py-3" : "px-6 py-6"}`}
      >
        <div className={`mx-auto w-full ${compact ? "max-w-full" : "max-w-[920px]"}`}>
          {state.chatMessages.length === 0 ? (
            <div data-testid="chat-empty-state">
              {!compact && <WelcomeHero onSelectPrompt={setInput} />}
              {compact && (
                <p className="text-sm text-slate-400">
                  No messages yet. Ask the agent to investigate, explore APIs, or summarize.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-5 pb-4">
              {state.chatMessages.map((m) => (
                <MessageBubble key={m.id} message={m} developerMode={!isClientMode} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>
      <ChatComposer
        value={input}
        onChange={setInput}
        onSend={send}
        onStop={stop}
        streaming={streaming}
        modeLabel={isClientMode ? "Support Mode" : chatModeLabel}
        contextLabel={contextLabel}
        zendeskStatus={zendeskStatus}
        isClientMode={isClientMode}
        setCommandPalette={setCommandPalette}
        chatMode={chatMode}
        onChatModeChange={onChatModeChange}
        canUseDeveloperMode={canUseDeveloperMode}
        modeError={modeError}
        pendingAttachments={pendingAttachments}
        onAttach={onAttachClick}
        onFilesSelected={onFilesSelected}
        removePendingAttachment={removePendingAttachment}
        fileInputRef={fileInputRef}
      />
    </>
  );
}
