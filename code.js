delete window.$;
let wp = webpackChunkdiscord_app.push([[Symbol()], {}, r => r]);
webpackChunkdiscord_app.pop();

let modules = Object.values(wp.c);
let find = p => modules.find(p)?.exports;
let Q, R, C, D, http;

if (find(x => x?.exports?.Z?.__proto__?.getStreamerActiveStreamMetadata)) {
  Q = find(x => x?.exports?.Z?.__proto__?.getQuest)?.Z;
  R = find(x => x?.exports?.ZP?.getRunningGames)?.ZP;
  C = find(x => x?.exports?.Z?.__proto__?.getAllThreadsForParent)?.Z;
  D = find(x => x?.exports?.Z?.__proto__?.flushWaitQueue)?.Z;
  http = find(x => x?.exports?.tn?.get)?.tn;
} else {
  Q = find(x => x?.exports?.A?.__proto__?.getQuest)?.A;
  R = find(x => x?.exports?.Ay?.getRunningGames)?.Ay;
  C = find(x => x?.exports?.A?.__proto__?.getAllThreadsForParent)?.A;
  D = find(x => x?.exports?.h?.__proto__?.flushWaitQueue)?.h;
  http = find(x => x?.exports?.Bo?.get)?.Bo;
}

(async () => {
  if (window.__questSpoofActive) {
    console.log('Already running');
    return;
  }
  window.__questSpoofActive = true;

  // Priority: lower number = higher priority
  const TASK_PRIORITY = {
    PLAY_ACTIVITY: 1,
    PLAY_ON_DESKTOP: 1,
    STREAM_ON_DESKTOP: 1,
    WATCH_VIDEO: 10,
    WATCH_VIDEO_ON_MOBILE: 10,
    // any other task type gets default 5
  };

  try {
    // Filter active quests that have at least one known task type
    let availableQuests = [...Q.quests.values()].filter(q =>
      q.userStatus?.enrolledAt &&
      !q.userStatus?.completedAt &&
      new Date(q.config.expiresAt) > Date.now() &&
      ['WATCH_VIDEO', 'PLAY_ON_DESKTOP', 'STREAM_ON_DESKTOP', 'PLAY_ACTIVITY', 'WATCH_VIDEO_ON_MOBILE']
        .some(t => (q.config.taskConfig ?? q.config.taskConfigV2).tasks[t])
    );

    if (availableQuests.length === 0) {
      console.log('No active quest');
      window.__questSpoofActive = false;
      return;
    }

    // Sort quests by the highest priority task they contain (lower number first)
    availableQuests.sort((a, b) => {
      const tasksA = (a.config.taskConfig ?? a.config.taskConfigV2).tasks;
      const tasksB = (b.config.taskConfig ?? b.config.taskConfigV2).tasks;
      const priorityA = Math.min(...Object.keys(tasksA).map(t => TASK_PRIORITY[t] ?? 5));
      const priorityB = Math.min(...Object.keys(tasksB).map(t => TASK_PRIORITY[t] ?? 5));
      return priorityA - priorityB;
    });

    let quest = availableQuests[0]; // highest priority quest

    console.log(`🎯 Quest: ${quest.config.messages.questName}`);
    let taskCfg = quest.config.taskConfig ?? quest.config.taskConfigV2;
    let tasks = taskCfg.tasks;

    // Pick the highest priority task inside this quest
    let taskKeys = Object.keys(tasks);
    taskKeys.sort((a, b) => (TASK_PRIORITY[a] ?? 5) - (TASK_PRIORITY[b] ?? 5));
    let task = taskKeys[0]; // most important task

    let need = tasks[task].target;
    let done = quest.userStatus?.progress?.[task]?.value || 0;
    if (done >= need) {
      console.log('✅ Already completed');
      window.__questSpoofActive = false;
      return;
    }

    const logProgress = (current) => {
      let pct = Math.floor((current / need) * 100);
      console.log(`Progress: ${current}/${need} (${pct}%)`);
    };

    if (task.includes('VIDEO')) {
      for (let p = done; p < need; p++) {
        await http.post({ url: `/quests/${quest.id}/video-progress`, body: { timestamp: p } });
        if (p % 10 === 0 || p === done) logProgress(p);
        await new Promise(r => setTimeout(r, 1000));
      }
      logProgress(need);
      console.log('✅ Video done');
    } else if (task === 'PLAY_ACTIVITY') {
      let chan = C.getSortedPrivateChannels()[0]?.id || '@me';
      let key = `call:${chan}:1`;
      while (done < need) {
        let res = await http.post({ url: `/quests/${quest.id}/heartbeat`, body: { stream_key: key, terminal: false } });
        done = res?.body?.progress?.PLAY_ACTIVITY?.value ?? done;
        logProgress(done);
        if (done >= need) {
          await http.post({ url: `/quests/${quest.id}/heartbeat`, body: { stream_key: key, terminal: true } });
          break;
        }
        await new Promise(r => setTimeout(r, 20000));
      }
      console.log('✅ Activity done');
    } else {
      try {
        console.log('Fetching application data...');
        let response = await http.get({ url: `/applications/public?application_ids=${quest.config.application.id}` });
        let appList = response.body;
        let app = appList[0];
        if (!app) throw new Error('Application not found');

        let exe = app.executables?.find(x => x.os === 'win32')?.name?.replace('>', '') || app.name + '.exe';
        let fake = {
          cmdLine: `"C:\\Program Files\\${app.name}\\${exe}"`, exeName: exe,
          exePath: `C:\\Program Files\\${app.name}\\${exe}`, hidden: false,
          isLauncher: false, id: app.id, name: app.name,
          pid: 1000 + Math.floor(Math.random() * 30000), pidPath: [],
          processName: exe.replace('.exe', ''), start: Date.now() - 60000,
          focused: true, lastFocused: Date.now(),
          windowHandle: { value: 10000 + Math.floor(Math.random() * 90000) },
          windowTitle: app.name, platform: 'win32', type: 0
        };
        let orig = R.getRunningGames;
        R.getRunningGames = () => [fake];
        R.getCandidateGames = () => [fake];
        R.getGameForPID = pid => fake.pid === pid ? fake : null;
        D.dispatch({ type: 'RUNNING_GAMES_CHANGE', removed: [], added: [fake], games: [fake] });

        let interval = setInterval(() => fake.lastFocused = Date.now(), 1000);
        let listener = e => {
          if (e.questId !== quest.id) return;
          let prog = e.userStatus?.progress?.[task]?.value;
          if (prog !== undefined) {
            logProgress(prog);
            if (prog >= need) {
              clearInterval(interval);
              D.unsubscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', listener);
              R.getRunningGames = orig;
              R.getCandidateGames = orig;
              R.getGameForPID = () => null;
              D.dispatch({ type: 'RUNNING_GAMES_CHANGE', removed: [fake], added: [], games: [] });
              console.log('✅ Quest completed');
              window.__questSpoofActive = false;
            }
          }
        };
        D.subscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', listener);
      } catch (err) {
        console.log('❌ Spoof error:', err.message);
        console.log('💡 Tip: If this is a network error, try disabling Opera GX ad blocker / VPN / GX Control, or use Chrome/Edge.');
        window.__questSpoofActive = false;
      }
    }
  } catch (err) {
    console.error(err);
    window.__questSpoofActive = false;
  }
})();
