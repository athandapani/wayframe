"use client";

// Owner-facing Invite / share management (wayframe#t37) — public link,
// email invites, and current members, in the same modal shape
// CategoryManager.tsx already established (fixed backdrop, --wf-* themed
// card, role="dialog", scrollable body, ✕ close). Wired in via
// RoadmapWorkspace's Options menu, guarded by canManageSharing.
import { useEffect, useState } from "react";

type ShareRole = "editor" | "viewer";
type Role = "owner" | ShareRole;

interface Member {
  identity: string;
  role: Role;
}

interface Invite {
  email: string;
  role: ShareRole;
  createdAt: string;
}

interface ShareLink {
  token: string;
  role: ShareRole;
}

type AccessState =
  | { status: "loading"; members: Member[]; invites: Invite[]; shareLink: ShareLink | null }
  | { status: "ready"; members: Member[]; invites: Invite[]; shareLink: ShareLink | null }
  | { status: "error"; members: Member[]; invites: Invite[]; shareLink: ShareLink | null; error: string };

// Same absolute (not relative) formatting convention RoadmapWorkspace.tsx's
// own module-private formatLastUpdated uses, reimplemented here since that
// helper isn't exported.
function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  const datePart = `${d.getMonth() + 1}/${d.getDate()}`;
  const timePart = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${datePart} ${timePart}`;
}

export function SharePanel({ portfolioId, onClose }: { portfolioId: string; onClose: () => void }) {
  const [state, setState] = useState<AccessState>({ status: "loading", members: [], invites: [], shareLink: null });

  const [copied, setCopied] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [newLinkRole, setNewLinkRole] = useState<ShareRole>("viewer");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ShareRole>("viewer");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSending, setInviteSending] = useState(false);
  const [deliveryFailures, setDeliveryFailures] = useState<Set<string>>(new Set());

  const [memberError, setMemberError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portfolios/${portfolioId}/access`)
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", members: [], invites: [], shareLink: null, error: body.error ?? "Something went wrong." });
          return;
        }
        setState({ status: "ready", members: body.members, invites: body.invites, shareLink: body.shareLink });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", members: [], invites: [], shareLink: null, error: "Something went wrong loading sharing settings." });
      });
    return () => {
      cancelled = true;
    };
  }, [portfolioId]);

  function shareUrl(token: string): string {
    return `${window.location.origin}/p/${portfolioId}?share=${token}`;
  }

  async function handleCopyLink(token: string) {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied/unavailable — no toast library exists
      // here, so this just silently fails; the link is still visible/selectable.
    }
  }

  async function handleCreateLink(role: ShareRole) {
    setLinkBusy(true);
    setLinkError(null);
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/share-link`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = await res.json();
      if (!res.ok) {
        setLinkError(body.error ?? "Something went wrong.");
        return;
      }
      setState((s) => ({ ...s, shareLink: { token: body.token, role: body.role } }));
    } finally {
      setLinkBusy(false);
    }
  }

  async function handleChangeLinkRole(role: ShareRole) {
    setLinkBusy(true);
    setLinkError(null);
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/share-link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = await res.json();
      if (!res.ok) {
        setLinkError(body.error ?? "Something went wrong.");
        return;
      }
      setState((s) => ({ ...s, shareLink: { token: body.token, role: body.role } }));
    } finally {
      setLinkBusy(false);
    }
  }

  async function handleTurnOffLink() {
    setLinkBusy(true);
    setLinkError(null);
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/share-link`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) {
        setLinkError(body.error ?? "Something went wrong.");
        return;
      }
      setState((s) => ({ ...s, shareLink: null }));
    } finally {
      setLinkBusy(false);
    }
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteSending(true);
    setInviteError(null);
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const body = await res.json();
      if (!res.ok) {
        setInviteError(body.error ?? "Something went wrong.");
        return;
      }
      setState((s) => ({
        ...s,
        invites: [{ email: body.email, role: body.role, createdAt: new Date().toISOString() }, ...s.invites.filter((i) => i.email !== body.email)],
      }));
      if (!body.emailSent) {
        setDeliveryFailures((prev) => {
          const next = new Set(prev);
          next.add(body.email);
          return next;
        });
      }
      setInviteEmail("");
    } finally {
      setInviteSending(false);
    }
  }

  async function handleCancelInvite(email: string) {
    setState((s) => ({ ...s, invites: s.invites.filter((i) => i.email !== email) }));
    try {
      await fetch(`/api/portfolios/${portfolioId}/invites/${encodeURIComponent(email)}`, { method: "DELETE" });
    } catch {
      // Best-effort — the invite row already dropped out of the local list.
    }
  }

  async function handleRemoveMember(identity: string) {
    setMemberError(null);
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/members/${encodeURIComponent(identity)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMemberError(body.error ?? "Something went wrong.");
        return;
      }
      setState((s) => ({ ...s, members: s.members.filter((m) => m.identity !== identity) }));
    } catch {
      setMemberError("Something went wrong removing that member.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)", borderWidth: 1 }}
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Invite / share"
      >
        <div className="flex items-start justify-between gap-4 border-b p-5" style={{ borderColor: "var(--wf-border)" }}>
          <div>
            <h1 className="text-base font-semibold">Invite / share</h1>
            <p className="text-xs opacity-60">Manage who can view or edit this Portfolio.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-lg leading-none opacity-50 hover:opacity-100">
            ✕
          </button>
        </div>

        {state.status === "loading" && <p className="p-5 text-xs opacity-60">Loading…</p>}
        {state.status === "error" && <p className="p-5 text-xs text-red-500">{state.error}</p>}

        {state.status !== "loading" && state.status !== "error" && (
          <div className="space-y-5 p-5">
            <section>
              <h2 className="mb-2 text-xs font-semibold tracking-wide uppercase opacity-70">Public link</h2>
              {state.shareLink ? (
                (() => {
                  const link = state.shareLink;
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={shareUrl(link.token)}
                          aria-label="Share link"
                          onFocus={(e) => e.currentTarget.select()}
                          style={{ borderColor: "var(--wf-border)" }}
                          className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-xs"
                        />
                        <button
                          onClick={() => handleCopyLink(link.token)}
                          style={{ background: "var(--wf-accent)", color: "var(--wf-panel)" }}
                          className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium"
                        >
                          {copied ? "Copied" : "Copy link"}
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={link.role}
                          disabled={linkBusy}
                          onChange={(e) => handleChangeLinkRole(e.target.value as ShareRole)}
                          aria-label="Share link role"
                          style={{ borderColor: "var(--wf-border)" }}
                          className="rounded-full border bg-transparent px-2 py-1 text-xs"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>
                        <button
                          onClick={() => handleCreateLink(link.role)}
                          disabled={linkBusy}
                          style={{ borderColor: "var(--wf-border)" }}
                          className="rounded-full border px-2.5 py-1 text-[11px] opacity-80 hover:opacity-100"
                        >
                          Regenerate
                        </button>
                        <button
                          onClick={handleTurnOffLink}
                          disabled={linkBusy}
                          style={{ borderColor: "var(--wf-border)" }}
                          className="rounded-full border px-2.5 py-1 text-[11px] opacity-80 hover:opacity-100"
                        >
                          Turn off
                        </button>
                      </div>
                      <p className="text-[11px] opacity-55">Regenerating invalidates the current link for anyone who hasn&apos;t already opened it.</p>
                    </div>
                  );
                })()
              ) : (
                <div className="space-y-2">
                  <p className="text-xs opacity-60">No public link yet — anyone with the link can access this Portfolio at the role you choose below.</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={newLinkRole}
                      onChange={(e) => setNewLinkRole(e.target.value as ShareRole)}
                      aria-label="New link role"
                      style={{ borderColor: "var(--wf-border)" }}
                      className="rounded-full border bg-transparent px-2 py-1 text-xs"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button
                      onClick={() => handleCreateLink(newLinkRole)}
                      disabled={linkBusy}
                      style={{ background: "var(--wf-accent)", color: "var(--wf-panel)" }}
                      className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                    >
                      Create link
                    </button>
                  </div>
                </div>
              )}
              {linkError && <p className="mt-1 text-[11px] text-red-500">{linkError}</p>}
            </section>

            <section>
              <h2 className="mb-2 text-xs font-semibold tracking-wide uppercase opacity-70">Invite by email</h2>
              <form onSubmit={handleSendInvite} className="flex flex-wrap items-center gap-2">
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@company.com"
                  aria-label="Invite email"
                  style={{ borderColor: "var(--wf-border)" }}
                  className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-xs"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as ShareRole)}
                  aria-label="Invite role"
                  style={{ borderColor: "var(--wf-border)" }}
                  className="rounded-full border bg-transparent px-2 py-1 text-xs"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <button
                  type="submit"
                  disabled={inviteSending || !inviteEmail.trim()}
                  style={{ background: "var(--wf-accent)", color: "var(--wf-panel)" }}
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
                >
                  Send invite
                </button>
              </form>
              {inviteError && <p className="mt-1.5 text-[11px] text-red-500">{inviteError}</p>}
              {state.invites.length > 0 && (
                <ul className="mt-3 divide-y" style={{ borderColor: "var(--wf-border)" }}>
                  {state.invites.map((inv) => (
                    <li key={inv.email} className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
                      <span className="min-w-0 flex-1 truncate">{inv.email}</span>
                      <span className="opacity-60">{inv.role}</span>
                      <span className="opacity-50">{formatCreatedAt(inv.createdAt)}</span>
                      {deliveryFailures.has(inv.email) && <span className="text-red-500">Delivery failed — share the link with them directly</span>}
                      <button onClick={() => handleCancelInvite(inv.email)} className="opacity-60 hover:opacity-100">
                        ✕ Cancel
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-2 text-xs font-semibold tracking-wide uppercase opacity-70">Current members</h2>
              {memberError && <p className="mb-1.5 text-[11px] text-red-500">{memberError}</p>}
              <ul className="divide-y" style={{ borderColor: "var(--wf-border)" }}>
                {state.members.map((m) => (
                  <li key={m.identity} className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{m.identity}</span>
                    <span className="opacity-60">{m.role}</span>
                    {m.role !== "owner" && (
                      <button onClick={() => handleRemoveMember(m.identity)} className="opacity-60 hover:opacity-100">
                        ✕ Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] opacity-50">Identity is an account id, not a name.</p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
