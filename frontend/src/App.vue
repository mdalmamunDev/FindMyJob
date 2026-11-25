<template>
  <div>
    <div
      v-if="toastMessage"
      class="app-toast"
      :class="`app-toast-${toastType}`"
      :role="toastType === 'error' ? 'alert' : 'status'"
      aria-live="polite"
    >
      <span>{{ toastMessage }}</span>
      <button type="button" aria-label="Dismiss notification" @click="clearToast">
        ×
      </button>
    </div>
    <header class="topbar">
      <div class="brand">
        <h1>FindMyJob</h1>
        <p>Jobs ranked by resume match (Gemini)</p>
      </div>

      <form class="sync-form" @submit.prevent="runSync">
        <label>
          Category
          <select v-model="categoryId">
            <option value="">Select category</option>
            <option
              v-for="category in categories"
              :key="category.id"
              :value="String(category.id)"
            >
              {{ category.name }} — {{ category.nameBn }}
            </option>
          </select>
        </label>
        <label>
          Posted within (days)
          <input
            v-model.number="postedWithin"
            type="number"
            min="1"
            step="1"
            required
          />
        </label>
        <button type="submit" :disabled="syncing">
          {{ syncing ? "Syncing…" : "Sync" }}
        </button>
      </form>
      <div class="topbar">
        <p class="last-sync">Last synced with BDJobs: {{ lastSyncLabel }}</p>
        <button
          class="theme-toggle secondary"
          type="button"
          :aria-pressed="theme === 'dark'"
          @click="toggleTheme"
        >
          {{ theme === "dark" ? "☀" : "☾" }}
        </button>
      </div>
    </header>

    <nav class="source-tabs" aria-label="Job sources">
      <button
        type="button"
        :class="{ active: activeView === 'bdjobs' }"
        @click="setActiveView('bdjobs')"
      >
        BDJobs
      </button>
      <button
        type="button"
        :class="{ active: activeView === 'pasted' }"
        @click="setActiveView('pasted')"
      >
        Pasted jobs <span v-if="pastedJobCount">({{ pastedJobCount }})</span>
      </button>
    </nav>

    <section v-if="activeView === 'pasted'" class="pasted-view">
      <form class="paste-job-form" @submit.prevent="submitPastedJob">
        <h2>Paste a job listing</h2>
        <p>It will be queued immediately. Extraction, resume matching, and email drafting happen in the background.</p>
        <label>
          Source link (optional)
          <input
            v-model="pastedSourceUrl"
            type="url"
            placeholder="https://example.com/jobs/123"
          />
        </label>
        <textarea
          v-model="pastedJobText"
          rows="6"
          maxlength="30000"
          placeholder="Paste the complete job posting, including application instructions…"
          required
        ></textarea>
        <div class="paste-job-submit">
          <span role="status">{{ pastedReport }}</span>
          <button type="submit" :disabled="pastedSubmitting || pastedJobText.trim().length < 20">
            {{ pastedSubmitting ? "Adding to queue…" : "Queue pasted job" }}
          </button>
        </div>
      </form>

      <form
        class="filters pasted-filters"
        aria-label="Pasted job filters"
        @submit.prevent="applyPastedFilters"
      >
        <label>
          Min match %
          <input v-model.number="pastedFilters.min_match" type="number" min="0" max="100" />
        </label>
        <label>
          Max match %
          <input v-model.number="pastedFilters.max_match" type="number" min="0" max="100" />
        </label>
        <label>
          Added within (days)
          <input
            v-model.number="pastedFilters.added_within"
            type="number"
            min="1"
            step="1"
            placeholder="Any"
          />
        </label>
        <label>
          Search
          <input v-model="pastedFilters.q" type="search" placeholder="Title, company, or text" />
        </label>
        <label>
          Location
          <input v-model="pastedFilters.location" type="text" placeholder="Dhaka" />
        </label>
        <label>
          Job type
          <input v-model="pastedFilters.job_type" type="text" placeholder="Full-time" />
        </label>
        <label>
          Processing status
          <select v-model="pastedFilters.status">
            <option value="">Any status</option>
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <label>
          Applied
          <select v-model="pastedFilters.is_applied">
            <option value="">Any</option>
            <option value="true">Applied</option>
            <option value="false">Not applied</option>
          </select>
        </label>
        <label>
          Shortlisted
          <select v-model="pastedFilters.is_sort_listed">
            <option value="">Any</option>
            <option value="true">Shortlisted</option>
            <option value="false">Not shortlisted</option>
          </select>
        </label>
        <label>
          Removed
          <select v-model="pastedFilters.is_removed">
            <option value="false">Not removed</option>
            <option value="true">Removed</option>
            <option value="all">All</option>
          </select>
        </label>
        <button type="submit">Apply filters</button>
      </form>

      <p class="pasted-list-meta">
        {{ pastedJobs.length }} of {{ pastedJobCount }} pasted jobs
        <button type="button" class="secondary" @click="refreshPastedJobs">
          Refresh
        </button>
      </p>
      <div class="list-controls pasted-list-controls">
        <label>
          Sort by
          <select v-model="pastedSort" @change="applyPastedFilters">
            <option value="match_percent">Match percent</option>
            <option value="createdAt">Date added</option>
            <option value="updatedAt">Last updated</option>
            <option value="publishDate">Publishing date</option>
          </select>
        </label>
        <label>
          Order
          <select v-model="pastedSortDirection" @change="applyPastedFilters">
            <option value="desc">Newest / highest</option>
            <option value="asc">Oldest / lowest</option>
          </select>
        </label>
        <label>
          Per page
          <select v-model.number="pastedPageSize" @change="applyPastedFilters">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </label>
      </div>
      <main class="pasted-job-list">
        <p v-if="pastedLoading && !pastedJobs.length" class="empty">Loading pasted jobs…</p>
        <p v-else-if="!pastedJobs.length" class="empty">
          No pasted jobs yet. Paste a listing above to get started.
        </p>
        <article
          v-for="job in pastedJobs"
          :key="job._id"
          class="pasted-job-card"
        >
          <header class="pasted-card-header">
            <div>
              <div class="badges">
                <span v-if="job.match_percent !== undefined" class="badge match">
                  {{ job.match_percent }}% match
                </span>
                <span class="badge" :class="`status-${job.status}`">
                  {{ job.stage || job.status }}
                </span>
                <span v-if="job.isApplied" class="badge applied">Applied</span>
                <span v-if="job.isSortListed" class="badge shortlisted">Shortlisted</span>
                <span v-if="job.isRemoved" class="badge status-failed">Removed</span>
              </div>
              <h2>{{ job.extracted?.title || "Extracting job details…" }}</h2>
              <p class="company">{{ job.extracted?.company || "Company not extracted yet" }}</p>
            </div>
            <span class="pasted-created">Added {{ displayDate(job.createdAt) }}</span>
          </header>
          <p v-if="job.sourceUrl" class="pasted-source-link">
            <b>Source:</b>
            <a :href="websiteUrl(job.sourceUrl)" target="_blank" rel="noopener noreferrer">
              {{ job.sourceUrl }}
            </a>
          </p>

          <p v-if="job.error" class="pasted-error" role="alert">
            Processing error: {{ job.error }}
          </p>
          <button
            v-if="job.status === 'failed' && (!job.emailDraft?.subject || !job.emailDraft?.content)"
            type="button"
            :disabled="job.retrying"
            @click="resumePastedJob(job)"
          >
            {{ job.retrying ? "Resuming…" : "Finish unfinished steps" }}
          </button>
          <span v-if="job.retryReport" role="status">{{ job.retryReport }}</span>
          <p v-if="job.match_reason" class="pasted-match-reason">
            <b>Resume match:</b> {{ job.match_reason }}
          </p>

          <div v-if="job.extracted" class="pasted-details">
            <p><b>Location:</b> {{ job.extracted.location || "—" }}</p>
            <p><b>Published:</b> {{ displayDate(job.extracted.publishDate) }}</p>
            <p><b>Deadline:</b> {{ displayDate(job.extracted.deadline) }}</p>
            <p><b>Job type:</b> {{ job.extracted.jobType || "—" }}</p>
            <p><b>Workplace:</b> {{ job.extracted.workplace || "—" }}</p>
            <p><b>Experience:</b> {{ job.extracted.experience || "—" }}</p>
            <p><b>Education:</b> {{ job.extracted.education || "—" }}</p>
            <p><b>Salary:</b> {{ job.extracted.salary || "—" }}</p>
            <p><b>Skills:</b> {{ job.extracted.skills || "—" }}</p>
            <p><b>Requirements:</b> {{ job.extracted.requirements || "—" }}</p>
            <p><b>Apply instructions:</b> {{ job.extracted.applicationInstructions || "—" }}</p>
            <p>
              <b>Website:</b>
              <a v-if="websiteUrl(job.extracted.website)" :href="websiteUrl(job.extracted.website)" target="_blank" rel="noopener noreferrer">
                {{ job.extracted.website }}
              </a>
              <span v-else>—</span>
            </p>
            <section class="pasted-description">
              <h3>Job description</h3>
              <p>{{ job.extracted.description || "—" }}</p>
            </section>
          </div>

          <section
            v-if="job.emailDraft && (job.status === 'completed' || job.status === 'failed')"
            class="pasted-email"
          >
            <h3>Application email draft</h3>
            <form @submit.prevent="savePastedEmail(job)">
              <label>
                To
                <input v-model="job.emailDraft.to" type="email" placeholder="Hiring email address" />
              </label>
              <label>
                Subject
                <input v-model="job.emailDraft.subject" type="text" required />
              </label>
              <label>
                Content
                <textarea v-model="job.emailDraft.content" rows="9" required></textarea>
              </label>
              <div class="pasted-email-actions">
                <button type="submit" :disabled="job.emailSaving">
                  {{ job.emailSaving ? "Saving…" : "Save email draft" }}
                </button>
                <button type="button" class="secondary" @click="copyPastedEmail(job)">
                  Copy email
                </button>
                <button
                  type="button"
                  :disabled="job.emailSending"
                  @click="sendPastedEmail(job)"
                >
                  {{ job.emailSending ? "Sending…" : "Send email" }}
                </button>
                <span
                  v-if="job.emailReport"
                  role="status"
                  :class="{ 'pasted-email-success': job.emailReportSuccess }"
                >
                  {{ job.emailReport }}
                </span>
              </div>
            </form>
          </section>

          <div class="card-actions pasted-card-actions">
            <button
              type="button"
              class="secondary"
              @click="updatePastedJobField(job, 'isApplied', !job.isApplied)"
            >
              {{ job.isApplied ? "Mark not applied" : "Mark applied" }}
            </button>
            <button
              type="button"
              class="secondary"
              @click="updatePastedJobField(job, 'isSortListed', !job.isSortListed)"
            >
              {{ job.isSortListed ? "Remove shortlist" : "Shortlist" }}
            </button>
            <button
              type="button"
              :class="job.isRemoved ? 'secondary' : 'danger'"
              @click="updatePastedJobField(job, 'isRemoved', !job.isRemoved)"
            >
              {{ job.isRemoved ? "Restore" : "Remove" }}
            </button>
          </div>

          <details class="pasted-source">
            <summary>Original pasted listing</summary>
            <pre>{{ job.pastedText }}</pre>
          </details>
        </article>
      </main>
      <div class="pasted-pagination">
        <button
          v-if="pastedPage < pastedPageCount"
          type="button"
          class="secondary"
          :disabled="pastedLoading"
          @click="loadMorePastedJobs"
        >
          {{ pastedLoading ? "Loading…" : "Load more pasted jobs" }}
        </button>
      </div>
    </section>

    <div v-show="activeView === 'bdjobs'">
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
        <span class="toast-count">
          {{ progressTotal ? `${progressCurrent}/${progressTotal} checked` : `${progressCurrent} checked` }}
        </span>
      </div>
      <div class="toast-bar">
        <div class="toast-bar-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>
      <p v-if="progressHint" class="toast-hint">{{ progressHint }}</p>
      <div class="current-job" aria-live="polite">
        <template v-if="currentJob">
          <div class="current-job-badges">
            <span class="badge match">
              {{ currentJob.matchPercent === undefined ? "Scoring…" : `${currentJob.matchPercent}% match` }}
            </span>
            <span class="badge" :class="currentJob.source">
              {{ currentJob.source || "Job" }}
            </span>
            <span class="badge recent">
              {{
                currentJob.phase === "loading_details"
                  ? "Loading details"
                  : currentJob.phase === "scoring"
                    ? "Scoring"
                    : currentJob.phase === "scored"
                      ? "Scored"
                      : currentJob.phase === "already_saved"
                        ? "Already saved"
                        : "Checking"
              }}
            </span>
          </div>
          <strong class="current-job-title">{{ currentJob.jobTitle }}</strong>
          <p class="current-job-company">{{ currentJob.companyName || "Unknown company" }}</p>
          <p class="current-job-published">Published: {{ displayDate(currentJob.publishDate) }}</p>
          <p class="current-job-description">
            {{ stripHtml(currentJob.jobDescription) || "No description available." }}
          </p>
          <div class="current-job-meta">
            <p><b>Location:</b> {{ currentJob.location || "—" }}</p>
            <p><b>Education:</b> {{ stripHtml(currentJob.educationRequirements) || "—" }}</p>
            <p><b>Experience:</b> {{ currentJob.experience || "—" }}</p>
            <p><b>Job type:</b> {{ currentJob.jobType || "—" }}</p>
            <p><b>Workplace:</b> {{ currentJob.workplace || "—" }}</p>
            <p><b>Salary:</b> {{ currentJob.salary || "—" }}</p>
            <p><b>Deadline:</b> {{ displayDate(currentJob.deadline) }}</p>
            <p v-if="currentJob.skillsRequired">
              <b>Required skills:</b> {{ stripHtml(currentJob.skillsRequired) }}
            </p>
            <p v-if="currentJob.suggestedSkills">
              <b>Suggested skills:</b> {{ stripHtml(currentJob.suggestedSkills) }}
            </p>
            <p v-if="currentJob.additionalRequirements">
              <b>Requirements:</b> {{ stripHtml(currentJob.additionalRequirements) }}
            </p>
            <p v-if="currentJob.matchReason">
              <b>Match reason:</b> {{ currentJob.matchReason }}
            </p>
          </div>
          <p v-if="currentJob.detailsError" class="current-job-error">
            Details unavailable: {{ currentJob.detailsError }}. Using list data.
          </p>
        </template>
        <span v-else class="current-job-placeholder">Waiting for the next job…</span>
      </div>
    </aside>

    <form class="filters" aria-label="Filters" @submit.prevent="applyFilters">
      <label>
        Min match %
        <input v-model.number="filters.min_match" type="number" min="0" max="100" />
      </label>
      <label>
        Max match %
        <input v-model.number="filters.max_match" type="number" min="0" max="100" />
      </label>
      <label>
        Posted within (days)
        <input
          v-model.number="filters.posted_within"
          type="number"
          min="1"
          step="1"
          placeholder="Any"
        />
      </label>
      <label>
        Category
        <select v-model="filters.cat_id">
          <option value="">All categories</option>
          <option
            v-for="category in categories"
            :key="category.id"
            :value="String(category.id)"
          >
            {{ category.name }} — {{ category.nameBn }}
          </option>
        </select>
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
      <label>
        Shortlisted
        <select v-model="filters.is_sort_listed">
          <option value="">Any</option>
          <option value="true">Shortlisted</option>
          <option value="false">Not shortlisted</option>
        </select>
      </label>
      <label>
        Removed
        <select v-model="filters.is_removed">
          <option value="false">Not Removed</option>
          <option value="true">Removed</option>
          <option value="all">All</option>
        </select>
      </label>
      <button type="submit">Apply filters</button>
    </form>

    <section class="list-toolbar">
      <p class="list-meta">{{ listMeta }}</p>
      <div class="list-controls">
        <label>
          Sort by
          <select v-model="sort" @change="applyFilters">
            <option value="match_percent">Match percent</option>
            <option value="synced_at">Last synced</option>
            <option value="publishDate">Publishing date</option>
            <option value="first_seen_at">First seen</option>
          </select>
        </label>
        <label>
          Order
          <select v-model="sortDirection" @change="applyFilters">
            <option value="desc">Newest / highest</option>
            <option value="asc">Oldest / lowest</option>
          </select>
        </label>
        <label>
          Per page
          <select v-model.number="pageSize" @change="applyFilters">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </label>
        <button
          type="button"
          class="danger"
          :disabled="bulkRemoving || !totalCount || filters.is_removed === 'true'"
          @click="removeAllFiltered"
        >
          {{ bulkRemoving ? "Removing…" : `Remove all (${totalCount})` }}
        </button>
      </div>
    </section>

    <main class="job-list">
      <p v-if="!jobs.length" class="empty">
        No matching jobs found.
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
            <span v-if="job.isSortListed" class="badge shortlisted">Shortlisted</span>
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
          <p class="publish-date">Published: {{ displayDate(job.publishDate) }}</p>
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
              <!-- <span v-html="job.experience"></span> -->
              
              <span :title="stripHtml(job.experience)">{{ stripHtml(job.experience) || "—" }}</span>
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
            <button type="button" class="secondary" @click="updateJobField(job, 'isApplied', !job.isApplied)">
              {{ job.isApplied ? "Mark not applied" : "Mark applied" }}
            </button>
            <button type="button" class="secondary" @click="updateJobField(job, 'isSortListed', !job.isSortListed)">
              {{ job.isSortListed ? "Remove shortlist" : "Shortlist" }}
            </button>
            <button
              type="button"
              :class="job.isRemoved ? 'secondary' : 'danger'"
              @click="updateJobField(job, 'isRemoved', !job.isRemoved)"
            >
              {{ job.isRemoved ? "Restore" : "Remove" }}
            </button>
          </div>
        </div>

        <div class="logo-wrap" :aria-hidden="!job.logoUrl">
          <img v-if="job.logoUrl" :src="job.logoUrl" alt="" loading="lazy" />
        </div>
      </article>
    </main>
    <div ref="loadMoreSentinel" class="pagination-sentinel" aria-hidden="true"></div>
    <p v-if="loadingJobs" class="pagination-status" aria-live="polite">
      Loading more jobs…
    </p>
    <p v-else-if="jobs.length && !hasMore" class="pagination-status">
      You’ve reached the end of the list.
    </p>
    </div>
  </div>
</template>

<script>
import { jobCategories } from "./categories.js";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

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
      categories: jobCategories,
      activeView: "bdjobs",
      pastedJobText: "",
      pastedSourceUrl: "",
      pastedSubmitting: false,
      pastedReport: "",
      pastedJobs: [],
      pastedJobCount: 0,
      pastedPage: 1,
      pastedPageCount: 0,
      pastedPageSize: 20,
      pastedSort: "createdAt",
      pastedSortDirection: "desc",
      pastedFilters: {
        min_match: "",
        max_match: "",
        added_within: "",
        q: "",
        location: "",
        job_type: "",
        status: "",
        is_applied: "",
        is_sort_listed: "",
        is_removed: "false",
      },
      appliedPastedFilters: {
        min_match: "",
        max_match: "",
        added_within: "",
        q: "",
        location: "",
        job_type: "",
        status: "",
        is_applied: "",
        is_sort_listed: "",
        is_removed: "false",
      },
      pastedLoading: false,
      pastedRequestId: 0,
      toastMessage: "",
      toastType: "success",
      toastTimer: null,
      theme: localStorage.getItem("findmyjob-theme") === "dark" ? "dark" : "light",
      categoryId: "8",
      postedWithin: 2,
      syncing: false,
      baseDocumentTitle: "",
      syncReport: "",
      listMeta: "",
      lastSyncAt: null,
      jobs: [],
      page: 1,
      pageSize: 20,
      pageCount: 0,
      totalCount: 0,
      loadingJobs: false,
      hasMore: true,
      jobsRequestId: 0,
      loadMoreObserver: null,
      sort: "match_percent",
      sortDirection: "desc",
      bulkRemoving: false,
      socket: null,
      progressVisible: false,
      progressDone: false,
      progressError: false,
      progressCurrent: 0,
      progressTotal: 0,
      progressHint: "",
      currentJob: null,
      filters: {
        min_match: 0,
        max_match: "",
        posted_within: 5,
        cat_id: "",
        q: "",
        location: "",
        job_type: "",
        source: "all",
        is_recent: "",
        is_applied: "false",
        is_sort_listed: "",
        is_removed: "false",
      },
      appliedFilters: {
        min_match: 0,
        max_match: "",
        posted_within: 5,
        cat_id: "",
        q: "",
        location: "",
        job_type: "",
        source: "all",
        is_recent: "",
        is_applied: "false",
        is_sort_listed: "",
        is_removed: "false",
      },
    };
  },
  computed: {
    lastSyncLabel() {
      return this.lastSyncAt
        ? new Date(this.lastSyncAt).toLocaleString()
        : "Never";
    },
    progressPercent() {
      if (!this.progressTotal) return 0;
      return Math.min(
        100,
        Math.round((this.progressCurrent / this.progressTotal) * 100)
      );
    },
    pageTitle() {
      const baseTitle = this.baseDocumentTitle || "FindMyJob";
      if (!this.syncing) return baseTitle;
      const progress = this.progressTotal
        ? `${this.progressCurrent}/${this.progressTotal}`
        : `${this.progressCurrent}`;
      return `(${progress}) ${baseTitle}`;
    },
  },
  watch: {
    theme(theme) {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("findmyjob-theme", theme);
    },
    pageTitle(title) {
      document.title = title;
    },
  },
  mounted() {
    this.activeView =
      new URLSearchParams(window.location.search).get("view") === "pasted"
        ? "pasted"
        : "bdjobs";
    window.addEventListener("popstate", this.handleLocationChange);
    document.documentElement.dataset.theme = this.theme;
    this.baseDocumentTitle = document.title;
    document.title = this.pageTitle;
    this.connectSocket();
    this.loadMoreObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.loadNextPage();
        }
      },
      { rootMargin: "300px" }
    );
    if (this.$refs.loadMoreSentinel) {
      this.loadMoreObserver.observe(this.$refs.loadMoreSentinel);
    }
    this.loadJobs();
    this.loadSyncStatus();
    this.refreshPastedJobs();
  },
  beforeDestroy() {
    document.title = this.baseDocumentTitle || "FindMyJob";
    if (this.loadMoreObserver) {
      this.loadMoreObserver.disconnect();
      this.loadMoreObserver = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    if (this.toastTimer) clearTimeout(this.toastTimer);
    window.removeEventListener("popstate", this.handleLocationChange);
  },
  methods: {
    stripHtml,

    showToast(message, type = "success") {
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastMessage = message;
      this.toastType = type;
      this.toastTimer = setTimeout(() => {
        this.toastMessage = "";
        this.toastTimer = null;
      }, 4500);
    },

    clearToast() {
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = null;
      this.toastMessage = "";
    },

    setActiveView(view) {
      if (view !== "bdjobs" && view !== "pasted") return;
      const url = new URL(window.location.href);
      if (view === "pasted") {
        url.searchParams.set("view", "pasted");
      } else {
        url.searchParams.delete("view");
      }
      if (url.href !== window.location.href) {
        window.history.pushState({ view }, "", url);
      }
      this.activeView = view;
      if (view === "pasted") this.refreshPastedJobs();
    },

    handleLocationChange() {
      const view =
        new URLSearchParams(window.location.search).get("view") === "pasted"
          ? "pasted"
          : "bdjobs";
      if (this.activeView === view) return;
      this.activeView = view;
      if (view === "pasted") this.refreshPastedJobs();
    },

    applyPastedJobUpdate(update) {
      const job = this.pastedJobs.find(
        (item) => String(item._id) === String(update.id)
      );
      if (!job) {
        this.refreshPastedJobs();
        return;
      }

      [
        "status",
        "stage",
        "error",
        "extracted",
        "match_percent",
        "match_reason",
        "isApplied",
        "isRemoved",
        "isSortListed",
      ].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(update, key)) {
          this.$set(job, key, update[key]);
        }
      });
      if (
        update.status === "completed" ||
        update.emailDraftUpdated === true
      ) {
        this.refreshPastedJobs();
      }
    },

    toggleTheme() {
      this.theme = this.theme === "dark" ? "light" : "dark";
    },

    connectSocket() {
      const apiOrigin = apiBaseUrl
        ? new URL(apiBaseUrl, window.location.origin)
        : window.location;
      const protocol = apiOrigin.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${apiOrigin.host}/ws`;

      const open = () => {
        const socket = new WebSocket(url);
        this.socket = socket;

        socket.onopen = () => {
          this.refreshPastedJobs();
        };

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

      if (msg.type === "pasted_job_updated") {
        this.applyPastedJobUpdate(msg);
        return;
      }

      if (msg.type === "sync_started") {
        this.syncing = true;
        this.progressVisible = true;
        this.progressDone = false;
        this.progressError = false;
        this.progressCurrent = 0;
        this.progressTotal = msg.total || 0;
        this.currentJob = null;
        this.progressHint = [
          msg.categoryId ? `Category ${msg.categoryId}` : "",
          msg.postedWithin ? `posted within ${msg.postedWithin} days` : "",
        ].filter(Boolean).join(" · ") || "Starting…";
        this.syncReport = "";
        return;
      }

      if (msg.type === "sync_job") {
        this.currentJob = msg;
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
        this.progressTotal = msg.total || msg.fetched || this.progressTotal;
        this.progressHint = `Added ${msg.newly_added || 0} · Skipped ${msg.skipped || 0} · Pages ${msg.pages || 0}`;
        this.currentJob = null;
        this.syncReport = `Fetched ${msg.fetched} · Newly added ${msg.newly_added} · Skipped ${msg.skipped} · Pages ${msg.pages}`;
        this.reloadJobs();
        this.loadSyncStatus();

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
        this.currentJob = null;
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

    displayDate(value) {
      if (!value) return "—";
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
    },

    websiteUrl(value) {
      if (!value) return "";
      try {
        const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
      } catch {
        return "";
      }
    },

    async submitPastedJob() {
      this.pastedSubmitting = true;
      this.pastedReport = "";
      try {
        const response = await fetch(`${apiBaseUrl}/api/pasted-jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: this.pastedJobText,
            ...(this.pastedSourceUrl.trim()
              ? { sourceUrl: this.pastedSourceUrl.trim() }
              : {}),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not queue pasted job");
        this.pastedJobText = "";
        this.pastedSourceUrl = "";
        this.pastedReport = `Added to the processing queue (${data.id})`;
        await this.refreshPastedJobs();
      } catch (error) {
        this.pastedReport = error.message;
      } finally {
        this.pastedSubmitting = false;
      }
    },

    async refreshPastedJobs() {
      const requestId = ++this.pastedRequestId;
      try {
        const params = this.pastedListParams(1);
        const response = await fetch(
          `${apiBaseUrl}/api/pasted-jobs?${params}`
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load pasted jobs");
        if (requestId !== this.pastedRequestId) return;

        this.pastedJobs = data.jobs || [];
        this.pastedJobCount = data.count;
        this.pastedPage = data.page;
        this.pastedPageCount = data.pageCount;
      } catch (error) {
        if (requestId === this.pastedRequestId) {
          this.pastedReport = error.message;
        }
      }
    },

    pastedListParams(page) {
      const params = new URLSearchParams();
      Object.entries(this.appliedPastedFilters).forEach(([key, value]) => {
        if (value !== "" && value !== null && value !== undefined) {
          params.set(key, String(value));
        }
      });
      params.set("page", String(page));
      params.set("page_size", String(this.pastedPageSize));
      params.set("sort", this.pastedSort);
      params.set("sort_direction", this.pastedSortDirection);
      return params;
    },

    applyPastedFilters() {
      this.appliedPastedFilters = { ...this.pastedFilters };
      this.pastedJobs = [];
      this.pastedPage = 1;
      this.refreshPastedJobs();
    },

    async loadMorePastedJobs() {
      if (this.pastedLoading || this.pastedPage >= this.pastedPageCount) return;
      this.pastedLoading = true;
      try {
        const page = this.pastedPage + 1;
        const requestId = this.pastedRequestId;
        const response = await fetch(
          `${apiBaseUrl}/api/pasted-jobs?${this.pastedListParams(page)}`
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load more pasted jobs");
        if (requestId !== this.pastedRequestId) return;
        const existingIds = new Set(this.pastedJobs.map((job) => String(job._id)));
        this.pastedJobs = this.pastedJobs.concat(
          (data.jobs || []).filter((job) => !existingIds.has(String(job._id)))
        );
        this.pastedPage = data.page;
        this.pastedPageCount = data.pageCount;
      } catch (error) {
        this.pastedReport = error.message;
      } finally {
        this.pastedLoading = false;
      }
    },

    async savePastedEmail(job) {
      this.$set(job, "emailSaving", true);
      this.$set(job, "emailReport", "");
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/pasted-jobs/${encodeURIComponent(job._id)}/email`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(job.emailDraft),
          }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not save email draft");
        this.$set(job, "emailDraft", data.emailDraft);
        this.$set(job, "emailReport", "Draft saved");
      } catch (error) {
        this.$set(job, "emailReport", error.message);
      } finally {
        this.$set(job, "emailSaving", false);
      }
    },

    async sendPastedEmail(job) {
      this.$set(job, "emailSending", true);
      this.$set(job, "emailReport", "");
      this.$set(job, "emailReportSuccess", false);
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/pasted-jobs/${encodeURIComponent(job._id)}/send-email`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(job.emailDraft),
          }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not send email");
        this.showToast(data.message || "Email sent successfully");
      } catch (error) {
        this.showToast(error.message || "Could not send email", "error");
      } finally {
        this.$set(job, "emailSending", false);
      }
    },

    async resumePastedJob(job) {
      this.$set(job, "retrying", true);
      this.$set(job, "retryReport", "");
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/pasted-jobs/${encodeURIComponent(job._id)}/retry`,
          { method: "POST" }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not resume pasted job");
        this.$set(job, "status", "queued");
        this.$set(job, "stage", "resuming unfinished steps");
        this.$set(job, "error", "");
        this.$set(job, "retryReport", "Queued to finish processing");
      } catch (error) {
        this.$set(job, "retryReport", error.message);
      } finally {
        this.$set(job, "retrying", false);
      }
    },

    async updatePastedJobField(job, field, updatedValue) {
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/pasted-jobs/${encodeURIComponent(job._id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ [field]: updatedValue }),
          }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not update pasted job");
        this.$set(job, field, updatedValue);
        await this.refreshPastedJobs();
      } catch (error) {
        this.pastedReport = error.message;
      }
    },

    async copyPastedEmail(job) {
      try {
        const draft = job.emailDraft;
        await navigator.clipboard.writeText(
          `To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.content}`
        );
        this.$set(job, "emailReport", "Email copied");
      } catch (error) {
        this.$set(job, "emailReport", `Could not copy email: ${error.message}`);
      }
    },

    filterParams() {
      const params = new URLSearchParams();
      const keys = [
        "min_match",
        "max_match",
        "posted_within",
        "cat_id",
        "q",
        "location",
        "job_type",
        "source",
        "is_recent",
        "is_applied",
        "is_sort_listed",
        "is_removed",
      ];

      keys.forEach((key) => {
        const value = this.appliedFilters[key];
        if (key === "source" && value === "all") return;
        if (value !== "" && value !== null && value !== undefined) {
          params.set(key, value);
        }
      });

      return params;
    },

    listParams() {
      const params = this.filterParams();
      params.set("page", String(this.page));
      params.set("page_size", String(this.pageSize));
      params.set("sort", this.sort);
      params.set("sort_direction", this.sortDirection);
      return params;
    },

    applyFilters() {
      this.appliedFilters = { ...this.filters };
      this.reloadJobs();
    },

    reloadJobs() {
      this.page = 1;
      this.jobs = [];
      this.hasMore = true;
      return this.loadJobs();
    },

    loadNextPage() {
      if (this.loadingJobs || !this.hasMore) return;
      this.page += 1;
      this.loadJobs(true);
    },

    async loadJobs(append = false) {
      if (append && this.loadingJobs) return;
      if (!append) this.loadingJobs = false;
      const requestId = ++this.jobsRequestId;
      const requestedPage = this.page;
      this.loadingJobs = true;
      try {
        const res = await fetch(`${apiBaseUrl}/api/jobs?${this.listParams().toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load jobs");
        if (requestId !== this.jobsRequestId) return;
        this.jobs = append ? this.jobs.concat(data.jobs || []) : data.jobs || [];
        this.totalCount = data.count;
        this.page = data.page;
        this.pageCount = data.pageCount;
        this.hasMore = data.page < data.pageCount;
        this.listMeta = `Showing ${this.jobs.length} of ${data.count} jobs`;
      } catch (err) {
        if (requestId !== this.jobsRequestId) return;
        this.listMeta = err.message;
        this.page = requestedPage;
        if (!append) {
          this.jobs = [];
          this.totalCount = 0;
          this.pageCount = 0;
          this.hasMore = false;
        } else {
          this.hasMore = false;
        }
      } finally {
        if (requestId === this.jobsRequestId) {
          this.loadingJobs = false;
        }
      }
    },

    async loadSyncStatus() {
      try {
        const res = await fetch(`${apiBaseUrl}/api/sync/status`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load sync status");
        this.lastSyncAt = data.lastSyncAt;
      } catch (err) {
        console.error("Failed to load sync status", err);
      }
    },

    async runSync() {
      this.syncing = true;
      this.progressVisible = true;
      this.progressDone = false;
      this.progressError = false;
      this.progressCurrent = 0;
      this.progressTotal = 0;
      this.progressHint = [
        this.categoryId ? `Category ${this.categoryId}` : "",
        this.postedWithin ? `posted within ${this.postedWithin} days` : "",
      ].filter(Boolean).join(" · ") || "Starting…";
      this.syncReport = "";

      try {
        const res = await fetch(`${apiBaseUrl}/api/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(this.categoryId !== "" ? { categoryId: Number(this.categoryId) } : {}),
            postedWithin: Number(this.postedWithin),
          }),
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

    async updateJobField(job, field, updatedValue) {
      try {
        const res = await fetch(
          `${apiBaseUrl}/api/jobs/${encodeURIComponent(job.Jobid)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              [field]: updatedValue
            }),
          }
        );

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Update failed");
        }

        // Update the job status locally
        job[field] = updatedValue;

      } catch (err) {
        alert(err.message);
      }
    },

    async removeAllFiltered() {
      if (!window.confirm(`Remove all ${this.totalCount} matching jobs?`)) return;
      this.bulkRemoving = true;
      try {
        const res = await fetch(`${apiBaseUrl}/api/jobs/bulk-remove`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filters: Object.fromEntries(this.filterParams()),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Bulk remove failed");
        this.syncReport = `Removed ${data.removedCount} matching jobs`;
        await this.reloadJobs();
      } catch (err) {
        alert(err.message);
      } finally {
        this.bulkRemoving = false;
      }
    },
  },
};
</script>
