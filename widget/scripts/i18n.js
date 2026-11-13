// Body texts (tr() only works in iCUE metadata, not in the page itself).
// Language follows iCUE.iCUELanguage, falling back to the browser language.
var OrbitI18n = (function () {
  'use strict';

  var texts = {
    en: {
      music: 'MUSIC', shortcuts: 'SHORTCUTS', tasks: 'TASKS', calendar: 'CALENDAR', system: 'SYSTEM', options: 'OPTIONS',
      clock: 'CLOCK', clock24: '24-hour clock', showWeekday: 'Show weekday', showDate: 'Show date',
      movieMode: 'MOVIE MODE', movieHint: 'The film button at the bottom right dims the screen and stops the planet. Tap anywhere to come back.',
      movieBrightness: 'Brightness in movie mode',
      data: 'DATA', resetAll: 'Hold to reset all data', resetHint: 'Removes your options, tasks and history from this widget.',
      resetDone: 'All data has been reset', holdLonger: 'Keep holding to reset',
      credits: 'Planet textures: Solar System Scope (CC BY 4.0), based on NASA imagery.',
      version: 'Version', noWebgl: 'This PC cannot draw the 3D scene – showing a still image.',
      minShort: 'min', today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday', worked: 'worked',
      markDone: 'Mark as done', startFocus: 'Start focus session', running: 'LIVE', holdDelete: 'Hold to delete',
      emptyToday: 'Nothing planned for today. Add a task on the right.', emptyUpcoming: 'No upcoming tasks.',
      emptyHistory: 'Finished focus sessions show up here.', emptyDay: 'No tasks on this day.',
      newTask: 'NEW TASK', taskPlaceholder: 'What is next?', date: 'Date', duration: 'Length', priority: 'Priority',
      prio0: 'Low', prio1: 'Medium', prio2: 'High', add: 'Add', addAndStart: 'Add & start',
      finished: 'done', 'continue': 'CONTINUE', overview: 'OVERVIEW', workedToday: 'worked today', workedWeek: 'this week',
      doneToday: 'tasks done today', sessionsToday: 'sessions today',
      timer: 'Timer', timerLabel: 'TIMER', timerRunning: 'TIMER RUNNING', stopTimer: 'Stop timer', newTimer: 'NEW TIMER',
      timerPlaceholder: 'Name (optional)', timerHint: 'Runs at the top right. When it is over the screen frame pulses.', startTimer: 'Start timer',
      addOnDay: 'Task on this day', stateRun: 'IN PROGRESS', stateBreak: 'BREAK', stateBreakOver: 'BREAK IS OVER', statePaused: 'PAUSED',
      breakLeft: 'break left', pause: 'Pause', resume: 'Continue', finish: 'Done', endSession: 'End session',
      timerDone: 'Timer “{name}” is over', off: 'Off', breakOver: 'Your break is over', needBreak: 'Time for a {min} minute break',
      startBreak: 'Take a break', later: 'Later',
      tabToday: 'TODAY', tabUpcoming: 'UPCOMING', tabHistory: 'HISTORY', tabTimer: 'TIMER',
      focus: 'FOCUS', breakEvery: 'Break reminder after (min)', breakLen: 'Break length (min)', offShort: 'Off',
      cancel: 'Cancel', space: 'space', done: 'Done',
      cpuLoad: 'CPU', cpuTemp: 'CPU TEMP', gpuLoad: 'GPU', gpuTemp: 'GPU TEMP',
      noSensors: 'iCUE reports no CPU or GPU sensors on this PC.', loadingSensors: 'Reading sensors …',
      sys_ram: 'RAM', sys_network: 'Network', sys_lock: 'Lock', sys_taskmgr: 'Task Manager', sys_restart: 'Restart', sys_shutdown: 'Shut down',
      withHub: 'WITH ORBITDECK HUB', withHubHint: 'RAM, network and PC controls need the free Orbitdeck Edge Hub app on this PC.',
      musicHubHint: 'Volume, mute, microphone, speakers/headphones and the real visualizer need the free Orbitdeck Edge Hub app on this PC.',
      nothingPlaying: 'Nothing is playing',
      restored: 'Tasks and history restored from the hub', volume: 'VOLUME', microphone: 'MICROPHONE', outputDevice: 'OUTPUT',
      micOn: 'Your microphone has been on for {min} minutes', muteMic: 'Mute', keepOn: 'Keep on',
      micReminder: 'Microphone reminder after (min)',
      hubTitle: 'ORBITDECK HUB', hubReady: 'Connected', hubPairPending: 'Confirm on your PC', hubDenied: 'Access denied',
      hubProto: 'Please update widget and hub', hubLost: 'Connection lost \u2013 reconnecting \u2026', hubMissing: 'Not found', hubDemo: 'Demo mode',
      hubPairHint: 'Click \u201cAllow\u201d in the window \u201cAllow widget?\u201d on your PC.',
      hubDeniedHint: 'This widget may not use the hub yet.',
      hubMissingHint: 'Install and start the free app \u201cOrbitdeck Edge Hub\u201d for the visualizer, volume, shortcuts, RAM/network, PC controls and sounds.',
      askAgain: 'Ask again', openIcue: 'Open iCUE',
      edit: 'EDIT', shortcutsHub: 'Shortcuts need the free Orbitdeck Edge Hub app on this PC.', addShortcut: 'Add',
      shortcutsEmpty: 'Tap \u201cAdd\u201d to pin programs, folders or web pages here.',
      pick_apps: 'Programs', pick_folders: 'Folders', pick_url: 'Web page', urlPlaceholder: 'Address, e.g. youtube.com', namePlaceholder: 'Name (optional)',
      name: 'Name', loadingApps: 'Loading programs \u2026', noMatch: 'Nothing found.', search: 'Search',
      tooMany: 'At most 12 shortcuts', badUrl: 'That address does not work', scFailed: 'Could not do that',
      holdHint: 'Restart and shut down: hold the button.', holdToConfirm: 'Hold the button to confirm',
      am: 'AM', pm: 'PM'
    },
    de: {
      music: 'MUSIK', shortcuts: 'SHORTCUTS', tasks: 'AUFGABEN', calendar: 'KALENDER', system: 'SYSTEM', options: 'OPTIONEN',
      clock: 'UHR', clock24: '24-Stunden-Uhr', showWeekday: 'Wochentag zeigen', showDate: 'Datum zeigen',
      movieMode: 'KINOMODUS', movieHint: 'Der Film-Knopf unten rechts dimmt den Bildschirm und hält den Planeten an. Tippen irgendwo holt alles zurück.',
      movieBrightness: 'Helligkeit im Kinomodus',
      data: 'DATEN', resetAll: 'Halten: alle Daten zurücksetzen', resetHint: 'Löscht deine Optionen, Aufgaben und den Verlauf dieses Widgets.',
      resetDone: 'Alle Daten wurden zurückgesetzt', holdLonger: 'Zum Zurücksetzen gedrückt halten',
      credits: 'Planeten-Texturen: Solar System Scope (CC BY 4.0), auf Basis von NASA-Aufnahmen.',
      version: 'Version', noWebgl: 'Dieser PC kann die 3D-Szene nicht zeichnen – es wird ein Standbild gezeigt.',
      minShort: 'Min.', today: 'Heute', tomorrow: 'Morgen', yesterday: 'Gestern', worked: 'gearbeitet',
      markDone: 'Als erledigt markieren', startFocus: 'Fokus-Sitzung starten', running: 'LÄUFT', holdDelete: 'Halten zum Löschen',
      emptyToday: 'Für heute ist nichts geplant. Rechts eine Aufgabe anlegen.', emptyUpcoming: 'Keine anstehenden Aufgaben.',
      emptyHistory: 'Beendete Fokus-Sitzungen erscheinen hier.', emptyDay: 'Keine Aufgaben an diesem Tag.',
      newTask: 'NEUE AUFGABE', taskPlaceholder: 'Was steht an?', date: 'Datum', duration: 'Dauer', priority: 'Priorität',
      prio0: 'Niedrig', prio1: 'Mittel', prio2: 'Hoch', add: 'Hinzufügen', addAndStart: 'Hinzufügen & starten',
      finished: 'erledigt', 'continue': 'FORTSETZEN', overview: 'ÜBERSICHT', workedToday: 'heute gearbeitet', workedWeek: 'diese Woche',
      doneToday: 'Aufgaben heute erledigt', sessionsToday: 'Sitzungen heute',
      timer: 'Timer', timerLabel: 'TIMER', timerRunning: 'TIMER LÄUFT', stopTimer: 'Timer beenden', newTimer: 'NEUER TIMER',
      timerPlaceholder: 'Name (optional)', timerHint: 'Läuft oben rechts. Ist er abgelaufen, pulsiert der Bildschirmrand.', startTimer: 'Timer starten',
      addOnDay: 'Aufgabe an diesem Tag', stateRun: 'LÄUFT', stateBreak: 'PAUSE', stateBreakOver: 'PAUSE VORBEI', statePaused: 'ANGEHALTEN',
      breakLeft: 'Pause übrig', pause: 'Anhalten', resume: 'Weiter', finish: 'Erledigt', endSession: 'Sitzung beenden',
      timerDone: 'Timer „{name}“ ist abgelaufen', off: 'Aus', breakOver: 'Deine Pause ist vorbei', needBreak: 'Zeit für {min} Minuten Pause',
      startBreak: 'Pause machen', later: 'Später',
      tabToday: 'HEUTE', tabUpcoming: 'ANSTEHEND', tabHistory: 'VERLAUF', tabTimer: 'TIMER',
      focus: 'FOKUS', breakEvery: 'Pausen-Erinnerung nach (Min.)', breakLen: 'Pausenlänge (Min.)', offShort: 'Aus',
      cancel: 'Abbrechen', space: 'Leerzeichen', done: 'Fertig',
      cpuLoad: 'CPU', cpuTemp: 'CPU-TEMP.', gpuLoad: 'GPU', gpuTemp: 'GPU-TEMP.',
      noSensors: 'iCUE meldet auf diesem PC keine CPU- oder GPU-Sensoren.', loadingSensors: 'Sensoren werden gelesen …',
      sys_ram: 'RAM', sys_network: 'Netzwerk', sys_lock: 'Sperren', sys_taskmgr: 'Task-Manager', sys_restart: 'Neustart', sys_shutdown: 'Herunterfahren',
      withHub: 'MIT ORBITDECK HUB', withHubHint: 'RAM, Netzwerk und PC-Befehle brauchen die kostenlose App „Orbitdeck Edge Hub“ auf diesem PC.',
      musicHubHint: 'Lautstärke, Stumm, Mikrofon, Lautsprecher/Kopfhörer und der echte Visualizer brauchen die kostenlose App „Orbitdeck Edge Hub“ auf diesem PC.',
      nothingPlaying: 'Gerade läuft nichts',
      restored: 'Aufgaben und Verlauf aus der Sicherung im Hub wiederhergestellt', volume: 'LAUTST\u00c4RKE', microphone: 'MIKROFON', outputDevice: 'AUSGABE',
      micOn: 'Dein Mikrofon ist seit {min} Minuten an', muteMic: 'Stumm schalten', keepOn: 'Anlassen',
      micReminder: 'Mikro-Erinnerung nach (Min.)',
      hubTitle: 'ORBITDECK HUB', hubReady: 'Verbunden', hubPairPending: 'Am PC best\u00e4tigen', hubDenied: 'Zugriff abgelehnt',
      hubProto: 'Bitte Widget und Hub aktualisieren', hubLost: 'Verbindung weg \u2013 verbinde neu \u2026', hubMissing: 'Nicht gefunden', hubDemo: 'Demo-Modus',
      hubPairHint: 'Klicke am PC im Fenster \u201eWidget erlauben?\u201c auf \u201eErlauben\u201c.',
      hubDeniedHint: 'Dieses Widget darf den Hub noch nicht nutzen.',
      hubMissingHint: 'Installiere und starte die kostenlose App \u201eOrbitdeck Edge Hub\u201c f\u00fcr Visualizer, Lautst\u00e4rke, Shortcuts, RAM/Netzwerk, PC-Befehle und T\u00f6ne.',
      askAgain: 'Erneut fragen', openIcue: 'iCUE \u00f6ffnen',
      edit: 'BEARBEITEN', shortcutsHub: 'Shortcuts brauchen die kostenlose App \u201eOrbitdeck Edge Hub\u201c auf diesem PC.', addShortcut: 'Hinzuf\u00fcgen',
      shortcutsEmpty: 'Tippe auf \u201eHinzuf\u00fcgen\u201c, um Programme, Ordner oder Webseiten hier abzulegen.',
      pick_apps: 'Programme', pick_folders: 'Ordner', pick_url: 'Webseite', urlPlaceholder: 'Adresse, z. B. youtube.com', namePlaceholder: 'Name (optional)',
      name: 'Name', loadingApps: 'Programme werden geladen \u2026', noMatch: 'Nichts gefunden.', search: 'Suchen',
      tooMany: 'H\u00f6chstens 12 Shortcuts', badUrl: 'Diese Adresse geht nicht', scFailed: 'Hat nicht geklappt',
      holdHint: 'Neustart und Herunterfahren: Knopf gedr\u00fcckt halten.', holdToConfirm: 'Zum Best\u00e4tigen gedr\u00fcckt halten',
      am: 'AM', pm: 'PM'
    }
  };

  var lang = 'en';

  function setLanguage(code) {
    var short = String(code || '').toLowerCase().slice(0, 2);
    lang = texts[short] ? short : 'en';
    document.documentElement.lang = lang;
  }

  function t(key) {
    return (texts[lang] && texts[lang][key]) || texts.en[key] || key;
  }

  /** Fills every element with a data-t attribute. */
  function apply(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-t]'), function (el) {
      el.textContent = t(el.getAttribute('data-t'));
    });
  }

  setLanguage(typeof navigator !== 'undefined' ? navigator.language : 'en');
  function has(key, code) { return !!(texts[code || lang] && Object.prototype.hasOwnProperty.call(texts[code || lang], key)); }

  return { t: t, has: has, setLanguage: setLanguage, apply: apply, get lang() { return lang; } };
})();
