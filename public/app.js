function stripHtml(value) {
  if (!value) return "";
  var tmp = document.createElement("div");
  tmp.innerHTML = value;
  return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
}

new Vue({
  el: "#app",
  data: function () {
    return {
      amount: 50,
      syncing: false,
      syncReport: "",
      listMeta: "",
      jobs: [],
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
  mounted: function () {
    this.loadJobs();
  },
  methods: {
    stripHtml: stripHtml,

    jobTitle: function (job) {
      return job.jobTitle || job.JobTitleBng || "Untitled";
    },

    jobDesc: function (job) {
      return stripHtml(job.jobContext) || stripHtml(job.jobDescription);
    },

    detailUrl: function (jobId) {
      return "https://bdjobs.com/h/details/" + encodeURIComponent(jobId);
    },

    filterParams: function () {
      var params = new URLSearchParams();
      var filters = this.filters;
      var keys = [
        "min_match",
        "cat_id",
        "q",
        "location",
        "job_type",
        "source",
        "is_recent",
        "is_applied",
      ];

      keys.forEach(function (key) {
        var value = filters[key];
        if (key === "source" && value === "all") return;
        if (value !== "" && value !== null && value !== undefined) {
          params.set(key, value);
        }
      });

      return params;
    },

    loadJobs: function () {
      var self = this;
      return fetch("/api/jobs?" + this.filterParams().toString())
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || "Failed to load jobs");
            return data;
          });
        })
        .then(function (data) {
          self.jobs = data.jobs || [];
          self.listMeta = data.count + " jobs shown (sorted by match %)";
        })
        .catch(function (err) {
          self.listMeta = err.message;
          self.jobs = [];
        });
    },

    runSync: function () {
      var self = this;
      self.syncing = true;
      self.syncReport = "Sync in progress — scoring new jobs with Ollama…";

      fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(self.amount) || 1 }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || "Sync failed");
            return data;
          });
        })
        .then(function (data) {
          self.syncReport =
            "Fetched " +
            data.fetched +
            " · Newly added " +
            data.newly_added +
            " · Skipped " +
            data.skipped +
            " · Pages " +
            data.pages;
          return self.loadJobs();
        })
        .catch(function (err) {
          self.syncReport = "Sync error: " + err.message;
        })
        .then(function () {
          self.syncing = false;
        });
    },

    toggleApplied: function (job) {
      var self = this;
      var next = !job.isApplied;

      fetch("/api/jobs/" + encodeURIComponent(job.Jobid), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isApplied: next }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || "Update failed");
            return data;
          });
        })
        .then(function () {
          return self.loadJobs();
        })
        .catch(function (err) {
          alert(err.message);
        });
    },
  },
});
