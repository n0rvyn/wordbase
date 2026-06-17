// asr-check.swift <audioPath> [locale=zh-CN]
//
// Transcribes a short audio clip with Apple's built-in Speech framework and prints the
// recognized text to stdout. Used by podcast-stage.mjs as an optional speech-integrity
// gate: if a clip that should be a spoken episode yields little or no text, the audio is
// silent / garbled even though it decodes cleanly.
//
// Recognition prefers the on-device model when the locale's asset is installed; otherwise
// it falls back to Apple's server recognizer (the clip is sent to Apple). The mode is
// reported on stderr. To make zh-CN fully on-device, install the Chinese dictation asset:
//   System Settings → Keyboard → Dictation → add 简体中文 (and enable on-device dictation).
//
// stdout: recognized transcript (possibly empty)
// stderr: "[asr] mode=on-device|server locale=… onDevice=…" + any error
// exit:   0 ok · 2 not authorized · 3 recognizer unavailable · 4 recognition error/timeout · 64 usage

import Foundation
import Speech

func err(_ s: String) { FileHandle.standardError.write((s + "\n").data(using: .utf8)!) }

let args = CommandLine.arguments
guard args.count >= 2 else { err("usage: asr-check.swift <audio> [locale]"); exit(64) }
let path = args[1]
let localeId = args.count >= 3 ? args[2] : "zh-CN"
let url = URL(fileURLWithPath: path)
guard FileManager.default.fileExists(atPath: path) else { err("[asr] file not found: \(path)"); exit(64) }

// Speech Recognition is TCC-gated. status is usually already .authorized once dictation
// has been used; request once if undetermined (a GUI prompt appears for the host app).
func ensureAuthorized() -> Bool {
    switch SFSpeechRecognizer.authorizationStatus() {
    case .authorized: return true
    case .notDetermined:
        let sem = DispatchSemaphore(value: 0)
        var ok = false
        SFSpeechRecognizer.requestAuthorization { st in ok = (st == .authorized); sem.signal() }
        sem.wait()
        return ok
    default: return false
    }
}

guard ensureAuthorized() else {
    err("[asr] not authorized for Speech Recognition (grant it: System Settings → Privacy & Security → Speech Recognition)")
    exit(2)
}

guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeId)), recognizer.isAvailable else {
    err("[asr] recognizer unavailable for locale \(localeId)")
    exit(3)
}

let onDevice = recognizer.supportsOnDeviceRecognition
let request = SFSpeechURLRecognitionRequest(url: url)
request.requiresOnDeviceRecognition = onDevice
request.shouldReportPartialResults = false
err("[asr] mode=\(onDevice ? "on-device" : "server") locale=\(localeId) onDevice=\(onDevice)")

// Drive the recognition by pumping the main run loop rather than blocking it: the
// server recognizer delivers its network callbacks on the main run loop, so a blocking
// wait (semaphore) would starve them and hang until timeout.
var finalText = ""
var failure: Error?
var done = false
let task = recognizer.recognitionTask(with: request) { result, error in
    if let error = error { failure = error; done = true; CFRunLoopStop(CFRunLoopGetMain()); return }
    guard let result = result else { return }
    if result.isFinal {
        finalText = result.bestTranscription.formattedString
        done = true
        CFRunLoopStop(CFRunLoopGetMain())
    }
}

let deadline = Date().addingTimeInterval(120)
while !done && Date() < deadline {
    RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.25))
}
if !done {
    task.cancel()
    err("[asr] timeout")
    exit(4)
}
if let failure = failure {
    err("[asr] error: \(failure.localizedDescription)")
    exit(4)
}

print(finalText)
exit(0)
