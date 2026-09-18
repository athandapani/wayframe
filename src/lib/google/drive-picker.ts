"use client";

/**
 * wayframe#t30's Drive folder picker — loads Google's Picker JS API on
 * demand and resolves the user's folder pick. This repo has no
 * `@types/`-style package for Google's client Picker API (or gapi loader);
 * rather than add one for a handful of calls, this module declares just the
 * ambient shape it actually touches, the same "hand-roll it, don't pull in
 * an SDK for a thin slice of an API" posture room-token.ts/slides-api.ts
 * already take for other Google surfaces.
 */
declare global {
  interface Window {
    gapi?: {
      load: (api: string, callback: () => void) => void;
    };
    google?: {
      picker: {
        PickerBuilder: new () => GooglePickerBuilder;
        DocsView: new (viewId: unknown) => GoogleDocsView;
        ViewId: { FOLDERS: unknown };
        Action: { PICKED: string; CANCEL: string };
        Response: { ACTION: string; DOCUMENTS: string };
        Document: { ID: string; NAME: string };
      };
    };
  }
}

interface GoogleDocsView {
  setSelectFolderEnabled(enabled: boolean): GoogleDocsView;
  setIncludeFolders(include: boolean): GoogleDocsView;
}

interface GooglePicker {
  setVisible(visible: boolean): void;
}

interface GooglePickerBuilder {
  addView(view: GoogleDocsView): GooglePickerBuilder;
  setOAuthToken(token: string): GooglePickerBuilder;
  setDeveloperKey(key: string): GooglePickerBuilder;
  setCallback(cb: (data: Record<string, unknown>) => void): GooglePickerBuilder;
  build(): GooglePicker;
}

const PICKER_SCRIPT_ID = "wayframe-google-api-script";
let loadPromise: Promise<void> | null = null;

/** Injects Google's API loader script (idempotent) and resolves once the Picker library itself is ready. Safe to call more than once — later callers share the first call's in-flight promise, or short-circuit if `gapi` is already loaded. */
export function loadPickerApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.gapi?.load) {
    return new Promise((resolve) => window.gapi!.load("picker", resolve));
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(PICKER_SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => window.gapi?.load("picker", resolve));
      existing.addEventListener("error", () => reject(new Error("Failed to load Google API script")));
      return;
    }
    const script = document.createElement("script");
    script.id = PICKER_SCRIPT_ID;
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = () => window.gapi?.load("picker", resolve);
    script.onerror = () => reject(new Error("Failed to load Google API script"));
    document.body.appendChild(script);
  });
  return loadPromise;
}

export interface PickedDriveFolder {
  folderId: string;
  folderName: string;
}

/**
 * Opens a folder-only Drive Picker and resolves the user's pick, or `null`
 * if they cancel. If `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` isn't configured,
 * resolves `null` immediately without attempting to load the Picker at all
 * — this app has no dev-mode fallback for a real Google API key, so "not
 * configured" collapses to the same "no destination chosen" state as a
 * user cancelling, the same graceful-degradation posture other optional
 * external integrations in this repo (e.g. Smartsheet's
 * `SMARTSHEET_API_TOKEN`) already take for a missing credential.
 */
export async function openDrivePicker(accessToken: string): Promise<PickedDriveFolder | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;
  if (!apiKey) return null;

  await loadPickerApi();
  const google = window.google;
  if (!google) return null;

  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS).setSelectFolderEnabled(true).setIncludeFolders(true);
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setCallback((data) => {
        const action = data[google.picker.Response.ACTION];
        if (action === google.picker.Action.PICKED) {
          const docs = data[google.picker.Response.DOCUMENTS] as Array<Record<string, unknown>> | undefined;
          const doc = docs?.[0];
          if (doc) {
            resolve({ folderId: String(doc[google.picker.Document.ID]), folderName: String(doc[google.picker.Document.NAME]) });
            return;
          }
        }
        if (action === google.picker.Action.CANCEL) resolve(null);
      })
      .build();
    picker.setVisible(true);
  });
}
