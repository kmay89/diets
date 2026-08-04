//
//  ShoppingView.swift — the list, in a shop.
//
//  The one screen here that is not about cooking. Ticking things off a wrist
//  beats holding a phone in one hand and a basket in the other, and it is the
//  reason people keep a shopping app on a watch when they keep nothing else.
//
//  ERRERLabs — MIT licensed.
//

import SwiftUI

struct ShoppingView: View {
    @EnvironmentObject var link: WatchLink

    var body: some View {
        List {
            if link.kitchen.list.isEmpty {
                Text("Nothing on the list.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(link.kitchen.list) { item in
                    Button {
                        link.send("list.toggle", ["key": item.key])
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: item.checked ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(item.checked ? .green : .secondary)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(item.name)
                                    .strikethrough(item.checked)
                                    .lineLimit(1)
                                if !item.qty.isEmpty {
                                    Text(item.qty)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .navigationTitle("List")
    }
}
