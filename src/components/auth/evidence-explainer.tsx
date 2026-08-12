"use client";

import { useState } from "react";

import { EvidenceMarker } from "@/components/evidence/evidence-marker";

type Finding =
  | "need"
  | "budget"
  | "product"
  | "spec"
  | "competitor"
  | "competitorPrice"
  | "storeQuote"
  | "question";
type ExampleLanguage = "hinglish" | "english" | "tamilEnglish";
type Source =
  | "customer-need"
  | "customer-budget"
  | "representative-product"
  | "customer-competitor"
  | "customer-question"
  | "representative-quote";

type Turn = {
  speaker: "Customer" | "Representative";
  parts: Array<{ source?: Source; text: string }>;
};

const findings: Record<Finding, { label: string; value: string; source: Source }> = {
  need: { label: "Need", value: "Gaming + College", source: "customer-need" },
  budget: { label: "Budget", value: "₹80,000", source: "customer-budget" },
  product: { label: "Product", value: "Lenovo LOQ", source: "representative-product" },
  spec: { label: "Spec", value: "RTX 4060", source: "representative-product" },
  competitor: { label: "Competitor", value: "Amazon", source: "customer-competitor" },
  competitorPrice: { label: "Competitor price", value: "₹78,000", source: "customer-competitor" },
  storeQuote: { label: "Store quote", value: "~₹81,000", source: "representative-quote" },
  question: { label: "Question", value: "EMI", source: "customer-question" },
};

const examples: Record<ExampleLanguage, { label: string; turns: Turn[] }> = {
  hinglish: {
    label: "Hinglish",
    turns: [
      {
        speaker: "Customer",
        parts: [
          { source: "customer-need", text: "“Gaming aur college ke liye laptop chahiye.”" },
          { source: "customer-budget", text: "“Budget around ₹80,000 hai.”" },
        ],
      },
      {
        speaker: "Representative",
        parts: [
          {
            source: "representative-product",
            text: "“Lenovo LOQ RTX 4060 dekh sakte hain.”",
          },
          { text: "“Bank offer bhi available hai.”" },
        ],
      },
      {
        speaker: "Customer",
        parts: [
          { source: "customer-competitor", text: "“Amazon pe around ₹78,000 ka dikh raha tha.”" },
          { source: "customer-question", text: "“EMI kitni padegi?”" },
        ],
      },
      {
        speaker: "Representative",
        parts: [
          { source: "representative-quote", text: "“Bank offer ke baad around ₹81,000 padega.”" },
          { text: "“Main exact EMI check karta hoon.”" },
        ],
      },
    ],
  },
  english: {
    label: "English",
    turns: [
      {
        speaker: "Customer",
        parts: [
          { source: "customer-need", text: "“I’m looking for a laptop for gaming and college.”" },
          { source: "customer-budget", text: "“My budget is around ₹80,000.”" },
        ],
      },
      {
        speaker: "Representative",
        parts: [
          {
            source: "representative-product",
            text: "“You could look at the Lenovo LOQ with RTX 4060.”",
          },
          { text: "“There is also a bank offer available.”" },
        ],
      },
      {
        speaker: "Customer",
        parts: [
          { source: "customer-competitor", text: "“I saw it on Amazon for around ₹78,000.”" },
          { source: "customer-question", text: "“What would the EMI be?”" },
        ],
      },
      {
        speaker: "Representative",
        parts: [
          {
            source: "representative-quote",
            text: "“After the bank offer it would be around ₹81,000.”",
          },
          { text: "“Let me check the exact EMI.”" },
        ],
      },
    ],
  },
  tamilEnglish: {
    label: "Tamil + English",
    turns: [
      {
        speaker: "Customer",
        parts: [
          { source: "customer-need", text: "“Gaming-um college-um use panna laptop venum.”" },
          { source: "customer-budget", text: "“Budget around ₹80,000.”" },
        ],
      },
      {
        speaker: "Representative",
        parts: [
          { source: "representative-product", text: "“Lenovo LOQ RTX 4060 paarkalaam.”" },
          { text: "“Bank offer-um available.”" },
        ],
      },
      {
        speaker: "Customer",
        parts: [
          { source: "customer-competitor", text: "“Amazon-la around ₹78,000-ku paathen.”" },
          { source: "customer-question", text: "“EMI evlo varum?”" },
        ],
      },
      {
        speaker: "Representative",
        parts: [
          { source: "representative-quote", text: "“Bank offer-ku apram around ₹81,000 varum.”" },
          { text: "“Exact EMI check pannuren.”" },
        ],
      },
    ],
  },
};

function sourceClass(activeSource: Source, source?: Source) {
  return activeSource === source ? "turn-source turn-source-active" : "turn-source";
}

export function EvidenceExplainer() {
  const [activeFinding, setActiveFinding] = useState<Finding>("need");
  const [language, setLanguage] = useState<ExampleLanguage>("hinglish");
  const active = findings[activeFinding];
  const example = examples[language];

  function selectLanguage(nextLanguage: ExampleLanguage) {
    setLanguage(nextLanguage);
    setActiveFinding("need");
  }

  return (
    <section className="evidence-explainer" aria-labelledby="illustration-title">
      <div className="illustration-heading">
        <p className="eyebrow">Illustrative interaction</p>
        <h2 id="illustration-title">A finding should lead back to what was said.</h2>
        <p>This staged example explains ANUMA’s evidence relationship. It is not customer data.</p>
      </div>
      <div
        className="illustration-language-controls"
        role="group"
        aria-label="Illustrative conversation examples"
      >
        {(Object.keys(examples) as ExampleLanguage[]).map((option) => (
          <button
            aria-pressed={language === option}
            className={language === option ? "illustration-language-active" : undefined}
            key={option}
            onClick={() => selectLanguage(option)}
            type="button"
          >
            {examples[option].label}
          </button>
        ))}
      </div>
      <div className="illustration-content">
        <div
          className="turns"
          role="group"
          aria-label={`${example.label} illustrative electronics conversation`}
        >
          {example.turns.map((turn, turnIndex) => (
            <p
              className={
                turn.speaker === "Customer" ? "turn turn-customer" : "turn turn-representative"
              }
              key={`${language}-${turnIndex}`}
            >
              <span>{turn.speaker}</span>
              {turn.parts.map((part, partIndex) => (
                <span
                  className={sourceClass(active.source, part.source)}
                  id={part.source}
                  key={`${part.source ?? "context"}-${partIndex}`}
                >
                  {part.text}
                  {partIndex < turn.parts.length - 1 ? " " : null}
                </span>
              ))}
            </p>
          ))}
        </div>
        <div
          className="illustration-findings"
          role="group"
          aria-label="Illustrative structured findings"
        >
          {(Object.keys(findings) as Finding[]).map((finding) => {
            const item = findings[finding];
            return (
              <button
                aria-controls={item.source}
                aria-label={`${item.label} ${item.value} Source turn`}
                aria-pressed={activeFinding === finding}
                className={
                  activeFinding === finding
                    ? "illustration-finding illustration-finding-active"
                    : "illustration-finding"
                }
                key={finding}
                onFocus={() => setActiveFinding(finding)}
                onMouseEnter={() => setActiveFinding(finding)}
                onClick={() => setActiveFinding(finding)}
                type="button"
              >
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <EvidenceMarker timestamp="Source turn" />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
