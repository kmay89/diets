//
//  StepView.swift — what goes in next.
//
//  The other half of why a cooking watch app is worth having: you are holding
//  something with both hands and the instruction is on a screen you cannot
//  touch. The amounts come first, above the sentence, because that is the part
//  you reach for while reading it — the same ordering the phone uses.
//
//  Advancing sends a command rather than tracking its own position. The phone
//  owns where the cook is; two devices each keeping their own idea of the
//  current step is two devices that will eventually disagree, in a kitchen, out
//  loud.
//
//  ERRERLabs — MIT licensed.
//

import SwiftUI

struct StepView: View {
    @EnvironmentObject var link: WatchLink

    var body: some View {
        ScrollView {
            if let step = link.kitchen.step {
                VStack(alignment: .leading, spacing: 8) {
                    Text(step.position)
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    if !step.wants.isEmpty {
                        VStack(alignment: .leading, spacing: 3) {
                            ForEach(step.wants) { want in
                                HStack(alignment: .firstTextBaseline, spacing: 6) {
                                    Text(want.amount)
                                        .font(.caption.bold())
                                    Text(want.name)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                }
                            }
                        }
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.gray.opacity(0.16), in: RoundedRectangle(cornerRadius: 10))
                    }

                    Text(step.text)
                        .font(.body)
                        .fixedSize(horizontal: false, vertical: true)

                    if let timer = step.timer {
                        VStack(alignment: .leading, spacing: 2) {
                            Button(timer.label) { link.send("timer.start") }
                                .buttonStyle(.borderedProminent)
                            if !timer.cue.isEmpty {
                                Text("until \(timer.cue)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                            if !timer.slack.isEmpty {
                                Text(timer.slack)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.top, 2)
                    }

                    HStack {
                        Button("Back") { link.send("step.back") }
                            .disabled(step.index == 0)
                        Button("Next") { link.send("step.next") }
                            .disabled(step.index >= step.total - 1)
                    }
                    .font(.caption2)
                    .buttonStyle(.bordered)
                }
                .navigationTitle(step.recipe)
            } else {
                VStack(spacing: 6) {
                    Text("Not cooking")
                        .font(.headline)
                    Text("Start cooking on your phone and the step shows up here.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 24)
            }
        }
    }
}
