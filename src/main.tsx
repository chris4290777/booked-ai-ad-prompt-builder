import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, Clipboard, RefreshCw, Sparkles } from "lucide-react";
import "./styles.css";
import {
  aspectRatios,
  ctas,
  expressions,
  formats,
  industries,
  products,
  tones,
  visualStyles,
} from "./options";
import { buildPrompt } from "./prompt-builder";
import type { BuilderState } from "./types";

const initialState: BuilderState = {
  productId: "ai_receptionist",
  industry: "General Local Business",
  tone: "Professional",
  visualStyle: "Dark blue tech glow",
  platformFormatId: "instagram-feed-ad",
  cta: "Auto",
  expression: "Confident",
  imageSource: "Generate new image",
};

function Field({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function App() {
  const [state, setState] = useState<BuilderState>(initialState);
  const [generated, setGenerated] = useState(() => buildPrompt(initialState));
  const [copied, setCopied] = useState(false);

  const selectedFormat = useMemo(
    () => formats.find((format) => format.id === state.platformFormatId) ?? formats[0],
    [state.platformFormatId],
  );

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === state.productId) ?? products[0],
    [state.productId],
  );

  function update<K extends keyof BuilderState>(key: K, value: BuilderState[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  function generate() {
    setGenerated(buildPrompt(state));
    setCopied(false);
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(generated.fullText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="builder-panel">
          <div className="brand-block">
            <div className="brand-mark">B</div>
            <div>
              <p>Booked AI Systems</p>
              <h1>Ad Prompt Builder</h1>
            </div>
          </div>

          <div className="form-grid">
            <Field label="Product" value={state.productId} onChange={(value) => update("productId", value)}>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Field>

            <Field label="Industry" value={state.industry} onChange={(value) => update("industry", value)}>
              {industries.map((industry) => (
                <option key={industry}>{industry}</option>
              ))}
            </Field>

            <Field label="Tone" value={state.tone} onChange={(value) => update("tone", value)}>
              {tones.map((tone) => (
                <option key={tone}>{tone}</option>
              ))}
            </Field>

            <Field
              label="Visual style"
              value={state.visualStyle}
              onChange={(value) => update("visualStyle", value)}
            >
              {visualStyles.map((style) => (
                <option key={style}>{style}</option>
              ))}
            </Field>

            <Field
              label="Platform + format"
              value={state.platformFormatId}
              onChange={(value) => update("platformFormatId", value)}
            >
              {formats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.platform} - {format.name}
                </option>
              ))}
            </Field>

            <div className="spec-row">
              <div>
                <span>Aspect ratio</span>
                <strong>{selectedFormat.aspectRatio}</strong>
              </div>
              <div>
                <span>Resolution</span>
                <strong>{selectedFormat.resolution}</strong>
              </div>
            </div>

            <Field label="CTA" value={state.cta} onChange={(value) => update("cta", value)}>
              {ctas.map((cta) => (
                <option key={cta}>{cta}</option>
              ))}
            </Field>

            <Field label="Expression" value={state.expression} onChange={(value) => update("expression", value)}>
              {expressions.map((expression) => (
                <option key={expression}>{expression}</option>
              ))}
            </Field>
          </div>

          <div className="segmented" aria-label="Image source">
            {["Generate new image", "Upload own image"].map((source) => (
              <button
                className={state.imageSource === source ? "active" : ""}
                key={source}
                onClick={() => update("imageSource", source as BuilderState["imageSource"])}
                type="button"
              >
                {source}
              </button>
            ))}
          </div>

          <button className="primary-action" onClick={generate} type="button">
            <Sparkles size={18} />
            Generate Prompt
          </button>

          <div className="product-summary">
            <span>Selected product</span>
            <strong>{selectedProduct.name}</strong>
            <p>{selectedProduct.positioning}</p>
          </div>

          <div className="logo-asset">
            <img src="/brand/booked-ai-logo-transparent-white.png" alt="Booked AI Systems transparent logo" />
            <p>Attach this PNG with the copied prompt when generating the final ad.</p>
          </div>
        </aside>

        <section className="output-panel">
          <div className="output-header">
            <div>
              <p>Copy-ready output</p>
              <h2>{generated.title}</h2>
            </div>
            <div className="output-actions">
              <button onClick={generate} type="button" title="Regenerate">
                <RefreshCw size={18} />
              </button>
              <button onClick={copyPrompt} type="button" title="Copy prompt">
                {copied ? <Check size={18} /> : <Clipboard size={18} />}
              </button>
            </div>
          </div>

          <div className="prompt-card">
            {generated.sections.map((section) => (
              <article key={section.heading}>
                <h3>{section.heading}</h3>
                <p>{section.body}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
