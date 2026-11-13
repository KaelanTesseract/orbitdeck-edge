using System.Globalization;

namespace OrbitdeckEdge.Hub.Infrastructure;

/// <summary>UI texts in German and English, chosen from the Windows display language.</summary>
internal static class Strings
{
    private static readonly bool German = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "de";

    private static string T(string de, string en) => German ? de : en;

    public static string AppName => "Orbitdeck Edge Hub";

    // Status
    public static string StatusReady(int widgets) => widgets switch
    {
        0 => T("Bereit – wartet auf das Widget", "Ready – waiting for the widget"),
        1 => T("Bereit – 1 Widget verbunden", "Ready – 1 widget connected"),
        _ => T($"Bereit – {widgets} Widgets verbunden", $"Ready – {widgets} widgets connected"),
    };
    public static string StatusAudioProblem => T("Windows-Audio nicht erreichbar", "Windows audio not available");
    public static string StatusPortBusy => T("Port 47822 ist belegt – läuft der Hub schon?", "Port 47822 is in use – is the hub already running?");

    // Menu
    public static string MenuSetup => T("Einrichtungs-Assistent …", "Setup assistant …");
    public static string MenuUpdateCheck => T("Nach Updates suchen", "Check for updates");
    public static string MenuDeleteAll => T("Alle Daten löschen …", "Delete all data …");
    public static string MenuPaired => T("Gekoppelte Widgets …", "Paired widgets …");
    public static string MenuAutostart => T("Mit Windows starten", "Start with Windows");
    public static string MenuLog => T("Log öffnen", "Open log");
    public static string MenuExit => T("Beenden", "Exit");

    // Setup assistant
    public static string SetupTitle => T("Orbitdeck Edge – Einrichtung", "Orbitdeck Edge – Setup");
    public static string Back => T("< Zurück", "< Back");
    public static string Next => T("Weiter >", "Next >");
    public static string Finish => T("Fertig", "Finish");
    public static string Cancel => T("Abbrechen", "Cancel");
    public static string StepOf(int step, int total) => T($"Schritt {step} von {total}", $"Step {step} of {total}");
    public static string WelcomeHeading => T("Willkommen bei Orbitdeck Edge", "Welcome to Orbitdeck Edge");
    public static string WelcomeText => T(
        "Orbitdeck Edge Hub ergänzt das Orbitdeck-Widget auf deiner XENEON EDGE um den Musik-Visualizer, Lautstärke, Mikrofon, Ausgabegerät, Shortcuts, RAM/Netzwerk, Sperren/Neustart/Herunterfahren und Töne für Timer und Pausen.\n\n" +
        "Die Einrichtung dauert eine Minute:\n" +
        "  1.  Das Widget zu iCUE hinzufügen und auf die Edge legen\n" +
        "  2.  Einmal „Erlauben“ klicken, wenn dieser PC fragt",
        "Orbitdeck Edge Hub adds the music visualizer, volume, microphone, output device, shortcuts, RAM/network, lock/restart/shut down and sounds for timers and breaks to the Orbitdeck widget on your XENEON EDGE.\n\n" +
        "Setup takes a minute:\n" +
        "  1.  Add the widget to iCUE and place it on the Edge\n" +
        "  2.  Click “Allow” once when this PC asks");
    public static string PrivacyNote => T(
        "Datenschutz: Orbitdeck Edge hat keine Server, sammelt keine Daten und verbindet sich nicht mit dem Internet (außer der freiwilligen Update-Suche). Alles bleibt auf diesem PC.",
        "Privacy: Orbitdeck Edge has no servers, collects no data and does not connect to the internet (except the optional update check). Everything stays on this PC.");
    public static string WidgetHeading => T("Widget zu iCUE hinzufügen", "Add the widget to iCUE");
    public static string WidgetText => T(
        "Klicke auf den Knopf, um das Widget in iCUE zu importieren. Leg es danach in iCUE auf deine XENEON EDGE (Größe XL, waagerecht).\n\n" +
        "Beim ersten Start fragt dieser PC einmal „Widget erlauben?“ – dort auf „Erlauben“ klicken.",
        "Click the button to import the widget into iCUE. Then place it on your XENEON EDGE in iCUE (size XL, horizontal).\n\n" +
        "On first start this PC asks once “Allow widget?” – click “Allow” there.");
    public static string WidgetInstall => T("Widget zu iCUE hinzufügen", "Add widget to iCUE");
    public static string UpdatedHeading(string version) => T($"Version {version} ist installiert", $"Version {version} is installed");
    public static string UpdatedText => T(
        "Damit iCUE die neue Version nutzt, entferne das alte Orbitdeck-Edge-Widget in iCUE und füge es mit dem Knopf neu hinzu. Die Kopplung bleibt erhalten, die Widget-Einstellungen in iCUE musst du ggf. neu wählen.",
        "To let iCUE use the new version, remove the old Orbitdeck Edge widget in iCUE and add it again with the button. The pairing is kept; you may have to pick the widget settings in iCUE again.");
    public static string WidgetMissing => T("Das Widget-Paket liegt (noch) nicht neben dem Hub. Es kommt mit dem Installer.", "The widget package is not next to the hub (yet). It comes with the installer.");
    public static string WidgetOpenFailed => T("iCUE hat sich nicht gemeldet. Importiere die Datei in iCUE von Hand: ", "iCUE did not respond. Import the file in iCUE manually: ");
    public static string OptionAutostart => T("Orbitdeck Edge Hub mit Windows starten (empfohlen)", "Start Orbitdeck Edge Hub with Windows (recommended)");
    public static string OptionUpdates => T("Einmal täglich nach neuen Versionen suchen (fragt nur GitHub nach der neuesten Versionsnummer)",
        "Check for new versions once a day (only asks GitHub for the latest version number)");

    // Delete all data
    public static string DeleteTitle => T("Alle Daten löschen", "Delete all data");
    public static string DeleteConfirm => T(
        "Das löscht alle Orbitdeck-Edge-Daten auf diesem PC:\n\n• alle gekoppelten Widgets\n• die Shortcuts\n• die Sicherung der Aufgaben und des Verlaufs\n• die Einstellungen und alle Logs\n\nDie Aufgaben im Widget selbst bleiben, bis du sie dort zurücksetzt. Danach wird der Hub beendet. Fortfahren?",
        "This deletes all Orbitdeck Edge data on this PC:\n\n• all paired widgets\n• the shortcuts\n• the backup of tasks and history\n• the settings and all logs\n\nThe tasks inside the widget stay until you reset them there. The hub exits afterwards. Continue?");
    public static string DeleteDone => T("Alle Daten wurden gelöscht. Orbitdeck Edge Hub wird jetzt beendet.", "All data has been deleted. Orbitdeck Edge Hub will exit now.");

    // Updates
    public static string UpdateAvailable(string version) => T($"Version {version} ist verfügbar – klicken zum Herunterladen.", $"Version {version} is available – click to download.");

    // Pairing
    public static string PairTitle => T("Widget erlauben?", "Allow widget?");
    public static string PairText(string origin) => T(
        $"Ein Widget möchte über Orbitdeck Edge Lautstärke, Programme und Sperren/Neustart/Herunterfahren dieses PCs steuern.\n\nHerkunft: {origin}\n\nErlaube das nur, wenn du gerade das Orbitdeck-Edge-Widget in iCUE hinzugefügt hast.",
        $"A widget wants to control this PC's volume, programs and lock/restart/shut down through Orbitdeck Edge.\n\nOrigin: {origin}\n\nOnly allow this if you just added the Orbitdeck Edge widget in iCUE.");
    public static string Allow => T("Erlauben", "Allow");
    public static string Deny => T("Ablehnen", "Deny");
    public static string UnknownOrigin => T("lokales Programm", "local program");
    public static string IcueOrigin => T("iCUE-Widget (lokale Datei)", "iCUE widget (local file)");

    // Paired widgets form
    public static string PairedTitle => T("Gekoppelte Widgets", "Paired widgets");
    public static string PairedColumnDate => T("Gekoppelt am", "Paired on");
    public static string PairedColumnOrigin => T("Herkunft", "Origin");
    public static string PairedRevoke => T("Kopplung aufheben", "Unpair");
    public static string PairedEmpty => T("Noch keine Widgets gekoppelt.", "No widgets paired yet.");
    public static string Close => T("Schließen", "Close");

    public static string AlreadyRunning => T("Orbitdeck Edge Hub läuft bereits (siehe Taskleiste).", "Orbitdeck Edge Hub is already running (see taskbar).");
}
