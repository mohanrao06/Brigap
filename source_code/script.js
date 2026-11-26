const STORAGE = {
  domain: "brigap_domain",
  path: "brigap_path",
  benchmark: "brigap_benchmark",
  apiKey: "brigap_gemini_api_key"
};

// Optional hardcoded fallback key (or paste directly into the UI box on ai-test-maker.html)
const DEFAULT_GEMINI_KEY = "";

function getApiKey() {
  return (localStorage.getItem(STORAGE.apiKey) || DEFAULT_GEMINI_KEY || "").trim();
}

function getSelectedDomain() {
  return localStorage.getItem(STORAGE.domain) || "All Domains";
}

function selectPath(level) {
  localStorage.setItem(STORAGE.path, level);
  const domain = getSelectedDomain();

  if (level === "beginner") {
    localStorage.setItem(
      STORAGE.benchmark,
      JSON.stringify({
        source: "beginner",
        domain,
        score: null,
        total: null,
        tier: "all" // Beginner sees all courses in that domain
      })
    );
  }
}

/* -------------------- STEP 1 & 2: Home Page Domain -> Level Flow -------------------- */
async function initHomePage() {
  const domainSelect = document.getElementById("home-domain-select");
  const continueBtn = document.getElementById("continue-domain-btn");
  const changeBtn = document.getElementById("change-domain-btn");
  const stepDomain = document.getElementById("step-domain");
  const stepLevel = document.getElementById("step-level");
  const domainPill = document.getElementById("chosen-domain-pill");
  const promptEl = document.getElementById("home-prompt");

  if (!domainSelect || !stepDomain || !stepLevel) return;

  try {
    const res = await fetch("./data/courses.json");
    const courses = await res.json();
    const domains = [...new Set(courses.map((c) => String(c["Domain"] || "").trim()).filter(Boolean))].sort();

    domainSelect.innerHTML =
      `<option value="">-- Choose a Domain (${domains.length} available) --</option>` +
      domains.map((d) => `<option value="${d}">${d}</option>`).join("");

    const saved = localStorage.getItem(STORAGE.domain);
    if (saved && domains.includes(saved)) {
      domainSelect.value = saved;
    }
  } catch (err) {
    console.error("Failed to load domains:", err);
    domainSelect.innerHTML = `<option value="General">General Technology &amp; Management</option>`;
  }

  const showLevelStep = (domain) => {
    localStorage.setItem(STORAGE.domain, domain);
    stepDomain.style.display = "none";
    stepLevel.style.display = "flex";
    if (domainPill) domainPill.textContent = `Domain: ${domain}`;
    if (promptEl) promptEl.textContent = "Step 2: Choose your current expertise level.";
  };

  continueBtn?.addEventListener("click", () => {
    const chosen = domainSelect.value;
    if (!chosen) {
      alert("Please select a domain first.");
      return;
    }
    showLevelStep(chosen);
  });

  changeBtn?.addEventListener("click", () => {
    stepLevel.style.display = "none";
    stepDomain.style.display = "block";
    if (promptEl) promptEl.textContent = "Step 1: Choose your domain to begin your personalized journey.";
  });
}

/* -------------------- AI Test Maker: 30 Domain MCQs (No Difficulty Labels) -------------------- */
let activeQuestions = [];

async function fetch30DomainMCQs(domain, apiKey) {
  const prompt = `Generate exactly 30 multiple-choice questions for the domain "${domain}".
Internal structure: 10 foundational questions, 10 intermediate questions, and 10 advanced questions, shuffled or ordered naturally.
CRITICAL RULE: Do NOT include any difficulty labels (do not write "Easy", "Medium", "Hard", or level tags anywhere in the question text or options).
Return ONLY a valid JSON array of 30 objects with this exact schema:
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answerIndex": 0
  }
]`;

  // Using active Gemini 3.5 Flash-Lite endpoint
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        responseMimeType: "application/json"
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("AI did not return a valid question array.");
  }

  return parsed.slice(0, 30);
}

function renderQuizQuestions(questions) {
  const form = document.getElementById("quiz-form");
  const submitBtn = document.getElementById("submit-quiz-btn");
  if (!form || !submitBtn) return;

  activeQuestions = questions;

  form.innerHTML = questions
    .map(
      (item, idx) => `
    <div style="padding:18px 20px;border-radius:16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.16);">
      <p style="font-weight:600;font-size:15px;line-height:1.45;margin-bottom:12px;">${idx + 1}. ${item.question}</p>
      <div style="display:grid;gap:8px;">
        ${item.options
          .map(
            (opt, oIdx) => `
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;opacity:0.92;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,0.03);">
            <input type="radio" name="q${idx}" value="${oIdx}">
            <span>${opt}</span>
          </label>`
          )
          .join("")}
      </div>
    </div>`
    )
    .join("");

  submitBtn.style.display = "inline-flex";
}

function initQuizPage() {
  const form = document.getElementById("quiz-form");
  const keyInput = document.getElementById("gemini-key-input");
  const genBtn = document.getElementById("generate-quiz-btn");
  const submitBtn = document.getElementById("submit-quiz-btn");
  const statusEl = document.getElementById("quiz-status");
  const badgeEl = document.getElementById("quiz-domain-badge");

  if (!form || !genBtn || !submitBtn) return;

  const domain = getSelectedDomain();
  if (badgeEl) badgeEl.textContent = `Domain: ${domain}`;

  const savedKey = getApiKey();
  if (savedKey && keyInput) {
    keyInput.value = savedKey;
  }

  const runGeneration = async () => {
    const key = (keyInput?.value || "").trim();
    if (!key) {
      statusEl.textContent = "Enter your Gemini API key above and click 'Generate 30 AI Questions'.";
      return;
    }
    localStorage.setItem(STORAGE.apiKey, key);

    genBtn.disabled = true;
    genBtn.textContent = "Generating 30 MCQs...";
    statusEl.textContent = `Generating 30 domain-specific questions for "${domain}" via Gemini AI...`;
    form.innerHTML = "";
    submitBtn.style.display = "none";

    try {
      const questions = await fetch30DomainMCQs(domain, key);
      statusEl.textContent = `${questions.length} questions ready for ${domain}. Answer and submit below.`;
      renderQuizQuestions(questions);
    } catch (err) {
      console.error(err);
      statusEl.textContent = `Error generating questions: ${err.message}`;
    } finally {
      genBtn.disabled = false;
      genBtn.textContent = "Regenerate 30 AI Questions";
    }
  };

  genBtn.addEventListener("click", runGeneration);

  // Auto-generate immediately if API key is already saved
  if (savedKey) {
    runGeneration();
  }

  submitBtn.addEventListener("click", () => {
    if (!activeQuestions.length) return;

    let score = 0;
    activeQuestions.forEach((item, idx) => {
      const chosen = form.querySelector(`input[name="q${idx}"]:checked`);
      if (chosen && Number(chosen.value) === Number(item.answerIndex)) {
        score += 1;
      }
    });

    // Exact score rules requested:
    // > 20  => "advanced" (Advanced courses only)
    // > 15  => "intermediate_advanced" (Intermediate & Advanced courses)
    // <= 15 => "all" (All courses of that domain)
    let tier = "all";
    if (score > 20) {
      tier = "advanced";
    } else if (score > 15) {
      tier = "intermediate_advanced";
    }

    localStorage.setItem(
      STORAGE.benchmark,
      JSON.stringify({
        source: "quiz",
        domain,
        score,
        total: activeQuestions.length,
        tier
      })
    );

    window.location.href = "course-recommendation.html";
  });
}

/* -------------------- Course Classification & Recommendation Page -------------------- */
function classifyCourseLevel(title, durationStr) {
  const t = title.toLowerCase();
  if (
    t.includes("advanced") ||
    t.includes("expert") ||
    t.includes("master") ||
    t.includes("deep") ||
    t.includes("architecture") ||
    t.includes("security") ||
    t.includes("analytics") ||
    t.includes("strategy")
  ) {
    return "advanced";
  }
  if (
    t.includes("awareness") ||
    t.includes("basic") ||
    t.includes("intro") ||
    t.includes("beginner") ||
    t.includes("fundamental") ||
    t.includes("overview")
  ) {
    return "beginner";
  }
  const mins = parseFloat(durationStr);
  if (!Number.isNaN(mins) && mins >= 90) return "advanced";
  if (!Number.isNaN(mins) && mins <= 30) return "beginner";
  return "intermediate";
}

function normalizeCourse(raw, idx) {
  const title = String(raw["Course Name"] || `Course #${idx + 1}`).trim();
  const domain = String(raw["Domain"] || "General").trim();
  const organisation = String(raw["Organisation"] || "Online Platform").trim();
  const duration = String(raw["Duration"] || "").trim();
  const linkRaw = String(raw["Course Link"] || "").trim();
  const url = linkRaw.startsWith("http") ? linkRaw : "";
  const level = classifyCourseLevel(title, duration);

  return { id: idx, title, domain, organisation, duration, level, url };
}

async function initRecommendationPage() {
  const listEl = document.getElementById("recommendations-list");
  const bannerEl = document.getElementById("benchmark-banner");
  const searchEl = document.getElementById("course-search");
  const domainEl = document.getElementById("domain-filter");
  const levelEl = document.getElementById("level-filter");
  if (!listEl) return;

  const savedDomain = getSelectedDomain();
  const benchmark = JSON.parse(localStorage.getItem(STORAGE.benchmark) || "null") || {
    source: "beginner",
    domain: savedDomain,
    score: null,
    total: 30,
    tier: "all"
  };

  const activeDomain = benchmark.domain || savedDomain;

  const tierDescription =
    benchmark.tier === "advanced"
      ? "Advanced Courses Only"
      : benchmark.tier === "intermediate_advanced"
      ? "Intermediate & Advanced Courses"
      : "All Domain Courses (Foundational to Advanced)";

  if (bannerEl) {
    bannerEl.textContent =
      benchmark.source === "quiz"
        ? `Domain: ${activeDomain} • Score: ${benchmark.score}/${benchmark.total} • Showing: ${tierDescription}`
        : `Domain: ${activeDomain} • Path: Beginner • Showing: ${tierDescription}`;
  }

  try {
    const res = await fetch("./data/courses.json");
    const rawCourses = await res.json();
    const allCourses = (Array.isArray(rawCourses) ? rawCourses : []).map(normalizeCourse);

    if (domainEl) {
      const domains = [...new Set(allCourses.map((c) => c.domain).filter(Boolean))].sort();
      domains.forEach((dom) => {
        const opt = document.createElement("option");
        opt.value = dom;
        opt.textContent = dom;
        domainEl.appendChild(opt);
      });
      if (domains.includes(activeDomain)) {
        domainEl.value = activeDomain;
      }
    }

    const render = () => {
      const query = (searchEl?.value || "").trim().toLowerCase();
      const selectedDomain = domainEl?.value || activeDomain;
      const mode = levelEl?.value || "recommended";

      let filtered = allCourses;
      if (selectedDomain && selectedDomain !== "all" && selectedDomain !== "All Domains") {
        filtered = filtered.filter((c) => c.domain === selectedDomain);
      }

      if (mode === "recommended") {
        if (benchmark.tier === "advanced") {
          const adv = filtered.filter((c) => c.level === "advanced");
          filtered = adv.length ? adv : filtered.filter((c) => c.level !== "beginner");
        } else if (benchmark.tier === "intermediate_advanced") {
          const midAdv = filtered.filter((c) => c.level === "intermediate" || c.level === "advanced");
          filtered = midAdv.length ? midAdv : filtered;
        }
        // If benchmark.tier === "all" (score <= 15 or Beginner), keep all courses in that domain
      } else if (mode !== "all") {
        filtered = filtered.filter((c) => c.level === mode);
      }

      if (query) {
        filtered = filtered.filter((c) =>
          `${c.title} ${c.organisation} ${c.domain}`.toLowerCase().includes(query)
        );
      }

      if (!filtered.length) {
        listEl.innerHTML = `<p style="grid-column:1/-1;text-align:center;font-size:16px;opacity:0.85;">No courses found for this filter.</p>`;
        return;
      }

      listEl.innerHTML = filtered
        .map(
          (c) => `
        <article style="padding:20px;border-radius:18px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.16);display:flex;flex-direction:column;justify-content:space-between;">
          <div>
            <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;opacity:0.82;margin-bottom:8px;">
              <span>${c.organisation}</span>
              <span>${c.duration || c.level}</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
              <span style="font-size:11px;padding:3px 10px;border-radius:12px;background:rgba(66,228,226,0.14);color:#8ff5ec;">
                ${c.domain}
              </span>
              <span style="font-size:11px;padding:3px 10px;border-radius:12px;background:rgba(111,176,255,0.16);color:#cfe5ff;text-transform:capitalize;">
                ${c.level}
              </span>
            </div>
            <h2 style="font-size:18px;line-height:1.35;margin-bottom:8px;font-weight:600;">${c.title}</h2>
          </div>
          ${
            c.url
              ? `<a class="button" style="margin-top:16px;padding:10px 18px;font-size:13px;text-align:center;" href="${c.url}" target="_blank" rel="noopener noreferrer">Open Course →</a>`
              : `<span style="margin-top:16px;font-size:12px;opacity:0.65;">Course link unavailable</span>`
          }
        </article>`
        )
        .join("");
    };

    searchEl?.addEventListener("input", render);
    domainEl?.addEventListener("change", render);
    levelEl?.addEventListener("change", render);
    render();
  } catch (err) {
    console.error("Course load error:", err);
    listEl.innerHTML = `<p style="grid-column:1/-1;text-align:center;font-size:16px;">Could not load <code>./data/courses.json</code>. Open via VS Code Live Server.</p>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initHomePage();
  initQuizPage();
  initRecommendationPage();
});