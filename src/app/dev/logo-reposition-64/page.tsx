// PROTOTYPE — wayfinder ticket #64 (https://github.com/athandapani/wayframe/issues/64).
// Throwaway spike answering "how should freeform logo repositioning/resizing
// behave?" — not production code. Lives on branch prototype/logo-reposition-64;
// dropped from main once the ticket resolves. Dev-only, gated below.
import { notFound } from "next/navigation";
import { LogoRepositionPrototype } from "./LogoRepositionPrototype";

export default function LogoRepositionPrototypePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LogoRepositionPrototype />;
}
