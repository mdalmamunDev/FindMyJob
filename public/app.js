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
    progressPercent: function () {
      if (!this.progressTotal) return 0;
      return Math.min(
        100,
        Math.round((this.progressCurrent / this.progressTotal) * 100)
      );
    },
  },
  mounted: function () {
    this.connectSocket();
    this.loadJobs();
  },
  beforeDestroy: function () {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  },
  methods: {
    stripHtml: stripHtml,

    connectSocket: function () {
      var self = this;
      var protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      var url = protocol + "//" + window.location.host + "/ws";

      function open() {
        var socket = new WebSocket(url);
        self.socket = socket;

        socket.onmessage = function (event) {
          try {
            self.onSocketMessage(JSON.parse(event.data));
          } catch (err) {
            console.error("Bad WS payload", err);
          }
        };

        socket.onclose = function () {
          self.socket = null;
          setTimeout(open, 2000);
        };
      }

      open();
    },

    onSocketMessage: function (msg) {
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
          (msg.newly_added || 0) +
          " new · " +
          (msg.skipped || 0) +
          " skipped" +
          (msg.jobTitle ? " · " + msg.jobTitle : "");
        return;
      }

      if (msg.type === "sync_done") {
        this.syncing = false;
        this.progressVisible = true;
        this.progressDone = true;
        this.progressError = false;
        this.progressCurrent = msg.fetched || this.progressCurrent;
        this.progressTotal = msg.fetched || this.progressTotal;
        this.progressHint =
          "Added " +
          (msg.newly_added || 0) +
          " · Skipped " +
          (msg.skipped || 0) +
          " · Pages " +
          (msg.pages || 0);
        this.syncReport =
          "Fetched " +
          msg.fetched +
          " · Newly added " +
          msg.newly_added +
          " · Skipped " +
          msg.skipped +
          " · Pages " +
          msg.pages;
        this.loadJobs();

        var self = this;
        setTimeout(function () {
          if (self.progressDone) self.progressVisible = false;
        }, 4000);
        return;
      }

      if (msg.type === "sync_error") {
        this.syncing = false;
        this.progressVisible = true;
        this.progressDone = false;
        this.progressError = true;
        this.progressHint = msg.error || "Unknown error";
        this.syncReport = "Sync error: " + (msg.error || "Unknown error");
      }
    },

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
      var amount = Number(self.amount) || 1;

      self.syncing = true;
      self.progressVisible = true;
      self.progressDone = false;
      self.progressError = false;
      self.progressCurrent = 0;
      self.progressTotal = amount;
      self.progressHint = "Starting…";
      self.syncReport = "";

      fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amount }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || "Sync failed");
            return data;
          });
        })
        .then(function () {
          // Work continues via WebSocket progress events
          self.progressHint = "Connected — waiting for progress…";
        })
        .catch(function (err) {
          self.syncing = false;
          self.progressError = true;
          self.progressHint = err.message;
          self.syncReport = "Sync error: " + err.message;
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
