<template>
  <div>
    <header class="topbar">
      <div class="brand">
        <h1>FindMyJob</h1>
        <p>BDJobs ranked by resume match (Ollama)</p>
      </div>

      <form class="sync-form" @submit.prevent="runSync">
        <label>
          Scan amount
          <input v-model.number="amount" type="number" min="1" required />
        </label>
        <button type="submit" :disabled="syncing">
          {{ syncing ? "Syncing…" : "Sync" }}
        </button>
      </form>
    </header>

    <p v-if="syncReport" class="sync-report">{{ syncReport }}</p>

    <aside
      v-if="progressVisible"
      class="sync-progress-toast"
      :class="{ done: progressDone, error: progressError }"
      aria-live="polite"
    >
      <div class="toast-top">
        <strong>
          {{ progressError ? "Sync failed" : progressDone ? "Sync done" : "Syncing" }}
        </strong>
        <span class="toast-count">{{ progressCurrent }}/{{ progressTotal }}</span>
      </div>
      <div class="toast-bar">
        <div class="toast-bar-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>
      <p v-if="progressHint" class="toast-hint">{{ progressHint }}</p>
    </aside>

    <section class="filters" aria-label="Filters">
      <label>
        Min match %
        <input v-model.number="filters.min_match" type="number" min="0" max="100" />
      </label>
      <label>
        Category id
        <input v-model="filters.cat_id" type="number" placeholder="Cat_id" />
      </label>
      <label>
        Search
        <input v-model="filters.q" type="search" placeholder="Title or company" />
      </label>
      <label>
        Location
        <input v-model="filters.location" type="text" placeholder="Dhaka" />
      </label>
      <label>
        Job type
        <input v-model="filters.job_type" type="text" placeholder="FullTime" />
      </label>
      <label>
        Source
        <select v-model="filters.source">
          <option value="all">All</option>
          <option value="premium">Premium</option>
          <option value="normal">Normal</option>
        </select>
      </label>
      <label>
        Recent
        <select v-model="filters.is_recent">
          <option value="">Any</option>
          <option value="true">Recent only</option>
          <option value="false">Not recent</option>
        </select>
      </label>
      <label>
        Applied
        <select v-model="filters.is_applied">
          <option value="">Any</option>
          <option value="true">Applied</option>
          <option value="false">Not applied</option>
        </select>
      </label>
      <button type="button" @click="loadJobs">Apply filters</button>
    </section>

    <p class="list-meta">{{ listMeta }}</p>

    <main class="job-list">
      <p v-if="!jobs.length" class="empty">
        No jobs yet. Run a sync to pull from BDJobs.
      </p>

      <article v-for="job in jobs" :key="job.Jobid" class="job-card">
        <div class="job-main">
          <div class="badges">
            <span class="badge match">{{ job.match_percent }}% match</span>
            <span
              class="badge"
              :class="job.source === 'premium' ? 'premium' : 'normal'"
            >
              {{ job.source || "normal" }}
            </span>
            <span v-if="job.isRecent" class="badge recent">Recent</span>
            <span v-if="job.isApplied" class="badge applied">Applied</span>
          </div>

          <h2 class="job-title">
            <a
              :href="detailUrl(job.Jobid)"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ jobTitle(job) }}
            </a>
          </h2>
          <p class="company">{{ job.companyName || "Unknown company" }}</p>
          <p v-if="jobDesc(job)" class="desc">{{ jobDesc(job) }}</p>

          <div class="meta">
            <div class="meta-row">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s7-4.35 7-10a7 7 0 1 0-14 0c0 5.65 7 10 7 10z" />
                <circle cx="12" cy="11" r="2.5" />
              </svg>
              <span>{{ job.location || "—" }}</span>
            </div>
            <div class="meta-row">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 9.5 12 5l9 4.5-9 4.5L3 9.5z" />
                <path d="M7 12.5v4.2c0 .4 2.2 2.3 5 2.3s5-1.9 5-2.3v-4.2" />
                <path d="M21 10v5" />
              </svg>
              <span :title="stripHtml(job.eduRec)">{{ stripHtml(job.eduRec) || "—" }}</span>
            </div>
          </div>

          <div class="card-footer">
            <div class="meta-row">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
              </svg>
              <span>{{ job.experience || "—" }}</span>
            </div>
            <div class="deadline">
              Deadline:
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M8 3v4M16 3v4M3 11h18" />
              </svg>
              <span>{{ job.deadline || "—" }}</span>
            </div>
          </div>

          <p v-if="job.match_reason" class="reason">{{ job.match_reason }}</p>

          <div class="card-actions">
            <button type="button" class="secondary" @click="toggleApplied(job)">
              {{ job.isApplied ? "Mark not applied" : "Mark applied" }}
            </button>
          </div>
        </div>

        <div class="logo-wrap" :aria-hidden="!job.logoUrl">
          <img v-if="job.logoUrl" :src="job.logoUrl" alt="" loading="lazy" />
        </div>
      </article>
    </main>
  </div>
</template>

<script>
function stripHtml(value) {
  if (!value) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = value;
  return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
}

export default {
  name: "App",
  data() {
    return {
      amount: 50,
      syncing: false,
      syncReport: "",
      listMeta: "",
      jobs: [],
      socket: null,
      progressVisible: false,
      progressDone: false,
      progressError: false,
      progressCurrent: 0,
      progressTotal: 0,
      progressHint: "",
      filters: {
        min_match: 0,
        cat_id: "",
        q: "",
        location: "",
        job_type: "",
        source: "all",
        is_recent: "",
        is_applied: "",
      },
    };
  },
  computed: {
    progressPercent() {
      if (!this.progressTotal) return 0;
      return Math.min(
        100,
        Math.round((this.progressCurrent / this.progressTotal) * 100)
      );
    },
  },
  mounted() {
    this.connectSocket();
    this.loadJobs();
  },
  beforeDestroy() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  },
  methods: {
    stripHtml,

    connectSocket() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/ws`;

      const open = () => {
        const socket = new WebSocket(url);
        this.socket = socket;

        socket.onmessage = (event) => {
          try {
            this.onSocketMessage(JSON.parse(event.data));
          } catch (err) {
            console.error("Bad WS payload", err);
          }
        };

        socket.onclose = () => {
          this.socket = null;
          setTimeout(open, 2000);
        };
      };

      open();
    },

    onSocketMessage(msg) {
      if (!msg || !msg.type) return;

      if (msg.type === "sync_started") {
        this.syncing = true;
        this.progressVisible = true;
        this.progressDone = false;
        this.progressError = false;
        this.progressCurrent = 0;
        this.progressTotal = msg.total || this.amount;
        this.progressHint = "Starting…";
        this.syncReport = "";
        return;
      }

      if (msg.type === "sync_progress") {
        this.syncing = true;
        this.progressVisible = true;
        this.progressDone = false;
        this.progressError = false;
        this.progressCurrent = msg.current || 0;
        this.progressTotal = msg.total || this.progressTotal;
        this.progressHint =
          `${msg.newly_added || 0} new · ${msg.skipped || 0} skipped` +
          (msg.jobTitle ? ` · ${msg.jobTitle}` : "");
        return;
      }

      if (msg.type === "sync_done") {
        this.syncing = false;
        this.progressVisible = true;
        this.progressDone = true;
        this.progressError = false;
        this.progressCurrent = msg.fetched || this.progressCurrent;
        this.progressTotal = msg.fetched || this.progressTotal;
        this.progressHint = `Added ${msg.newly_added || 0} · Skipped ${msg.skipped || 0} · Pages ${msg.pages || 0}`;
        this.syncReport = `Fetched ${msg.fetched} · Newly added ${msg.newly_added} · Skipped ${msg.skipped} · Pages ${msg.pages}`;
        this.loadJobs();

        setTimeout(() => {
          if (this.progressDone) this.progressVisible = false;
        }, 4000);
        return;
      }

      if (msg.type === "sync_error") {
        this.syncing = false;
        this.progressVisible = true;
        this.progressDone = false;
        this.progressError = true;
        this.progressHint = msg.error || "Unknown error";
        this.syncReport = `Sync error: ${msg.error || "Unknown error"}`;
      }
    },

    jobTitle(job) {
      return job.jobTitle || job.JobTitleBng || "Untitled";
    },

    jobDesc(job) {
      return stripHtml(job.jobContext) || stripHtml(job.jobDescription);
    },

    detailUrl(jobId) {
      return `https://bdjobs.com/h/details/${encodeURIComponent(jobId)}`;
    },

    filterParams() {
      const params = new URLSearchParams();
      const keys = [
        "min_match",
        "cat_id",
        "q",
        "location",
        "job_type",
        "source",
        "is_recent",
        "is_applied",
      ];

      keys.forEach((key) => {
        const value = this.filters[key];
        if (key === "source" && value === "all") return;
        if (value !== "" && value !== null && value !== undefined) {
          params.set(key, value);
        }
      });

      return params;
    },

    async loadJobs() {
      try {
        const res = await fetch(`/api/jobs?${this.filterParams().toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load jobs");
        this.jobs = data.jobs || [];
        this.listMeta = `${data.count} jobs shown (sorted by match %)`;
      } catch (err) {
        this.listMeta = err.message;
        this.jobs = [];
      }
    },

    async runSync() {
      const amount = Number(this.amount) || 1;

      this.syncing = true;
      this.progressVisible = true;
      this.progressDone = false;
      this.progressError = false;
      this.progressCurrent = 0;
      this.progressTotal = amount;
      this.progressHint = "Starting…";
      this.syncReport = "";

      try {
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Sync failed");
        this.progressHint = "Connected — waiting for progress…";
      } catch (err) {
        this.syncing = false;
        this.progressError = true;
        this.progressHint = err.message;
        this.syncReport = `Sync error: ${err.message}`;
      }
    },

    async toggleApplied(job) {
      const next = !job.isApplied;
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(job.Jobid)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isApplied: next }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Update failed");
        await this.loadJobs();
      } catch (err) {
        alert(err.message);
      }
    },
  },
};
</script>
