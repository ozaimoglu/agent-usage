#!/usr/bin/env python3
"""GNOME StatusNotifier bridge for Agent Usage.

The item intentionally exposes a DBusMenu but no ``Activate`` method. Ubuntu's
AppIndicator extension therefore opens the menu immediately on a primary
click, without waiting to decide whether the click is part of a double click.
The icon is served as the original SVG file, so GNOME composites its alpha
channel instead of capturing an opaque XEmbed window.
"""

import json
import ctypes
import os
import signal
import sys

import gi

gi.require_version("Gio", "2.0")
gi.require_version("GLib", "2.0")
gi.require_version("Atspi", "2.0")
from gi.repository import Atspi, Gio, GLib  # noqa: E402


SNI_BUS_NAME = "org.kde.StatusNotifierItem.AgentUsage"
SNI_PATH = "/StatusNotifierItem"
MENU_PATH = "/Menu"
SUMMARY_IDS = (10, 11, 12, 13, 14)
DETAIL_ID = 21
SETTINGS_ID = 22
QUIT_ID = 24

SNI_XML = """
<node>
  <interface name="org.kde.StatusNotifierItem">
    <property name="Category" type="s" access="read"/>
    <property name="Id" type="s" access="read"/>
    <property name="Title" type="s" access="read"/>
    <property name="Status" type="s" access="read"/>
    <property name="WindowId" type="i" access="read"/>
    <property name="IconThemePath" type="s" access="read"/>
    <property name="Menu" type="o" access="read"/>
    <property name="ItemIsMenu" type="b" access="read"/>
    <property name="IconName" type="s" access="read"/>
    <property name="IconPixmap" type="a(iiay)" access="read"/>
    <property name="OverlayIconName" type="s" access="read"/>
    <property name="OverlayIconPixmap" type="a(iiay)" access="read"/>
    <property name="AttentionIconName" type="s" access="read"/>
    <property name="AttentionIconPixmap" type="a(iiay)" access="read"/>
    <property name="AttentionMovieName" type="s" access="read"/>
    <method name="ContextMenu"><arg type="i" direction="in"/><arg type="i" direction="in"/></method>
    <method name="SecondaryActivate"><arg type="i" direction="in"/><arg type="i" direction="in"/></method>
    <method name="XAyatanaSecondaryActivate"><arg type="u" direction="in"/></method>
    <method name="Scroll"><arg type="i" direction="in"/><arg type="s" direction="in"/></method>
  </interface>
</node>
"""

MENU_XML = """
<node>
  <interface name="com.canonical.dbusmenu">
    <property name="Version" type="u" access="read"/>
    <property name="TextDirection" type="s" access="read"/>
    <property name="Status" type="s" access="read"/>
    <property name="IconThemePath" type="as" access="read"/>
    <method name="GetLayout">
      <arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="as" direction="in"/>
      <arg type="u" direction="out"/><arg type="(ia{sv}av)" direction="out"/>
    </method>
    <method name="GetGroupProperties">
      <arg type="ai" direction="in"/><arg type="as" direction="in"/><arg type="a(ia{sv})" direction="out"/>
    </method>
    <method name="GetProperty">
      <arg type="i" direction="in"/><arg type="s" direction="in"/><arg type="v" direction="out"/>
    </method>
    <method name="Event">
      <arg type="i" direction="in"/><arg type="s" direction="in"/><arg type="v" direction="in"/><arg type="u" direction="in"/>
    </method>
    <method name="EventGroup"><arg type="a(isvu)" direction="in"/><arg type="ai" direction="out"/></method>
    <method name="AboutToShow"><arg type="i" direction="in"/><arg type="b" direction="out"/></method>
    <method name="AboutToShowGroup">
      <arg type="ai" direction="in"/><arg type="ai" direction="out"/><arg type="ai" direction="out"/>
    </method>
    <signal name="ItemsPropertiesUpdated"><arg type="a(ia{sv})"/><arg type="a(ias)"/></signal>
    <signal name="LayoutUpdated"><arg type="u"/><arg type="i"/></signal>
  </interface>
</node>
"""


class TrayBridge:
    def __init__(self, icon_path, parent_pid):
        self.icon_path = icon_path
        self.parent_pid = parent_pid
        self.loop = GLib.MainLoop()
        self.connection = None
        self.owner_id = 0
        self.revision = 1
        self.active_bounds = None
        self.indicator_candidates = []
        self.pending_action = None
        self.pending_action_source = 0
        self.labels = {
            10: "[░░░░░░░░]  Codex Pro · —",
            11: "[░░░░░░░░]  Codex Plus · —",
            12: "[░░░░░░░░]  Agy 5h · —",
            13: "[░░░░░░░░]  Z.ai · —",
            14: "[░░░░░░░░]  Claude 5h · —",
        }
        self.visible = {10: True, 11: True, 12: True, 13: True, 14: False}

    def emit(self, event, bounds=None):
        try:
            message = {"event": event}
            if bounds is not None:
                message["bounds"] = bounds
            print(json.dumps(message), flush=True)
        except BrokenPipeError:
            self.loop.quit()

    @staticmethod
    def indicator_bounds():
        """Find the real GNOME panel actors instead of guessing their position."""
        try:
            desktop = Atspi.get_desktop(0)
            shell = next(
                (desktop.get_child_at_index(index) for index in range(desktop.get_child_count())
                 if desktop.get_child_at_index(index).get_name() == "gnome-shell"),
                None,
            )
            if shell is None:
                return []

            rule = Atspi.MatchRule.new(
                Atspi.StateSet.new([]), Atspi.CollectionMatchType.ALL,
                {}, Atspi.CollectionMatchType.ALL,
                [Atspi.Role.MENU], Atspi.CollectionMatchType.ALL,
                [], Atspi.CollectionMatchType.ALL,
                False,
            )
            menus = shell.get_collection_iface().get_matches(
                rule, Atspi.CollectionSortOrder.CANONICAL, 0, True,
            )

            def bounds(accessible):
                rect = accessible.get_component_iface().get_extents(Atspi.CoordType.SCREEN)
                if (0 < rect.width <= 512 and 0 < rect.height <= 512
                        and -100_000 < rect.x < 100_000 and -100_000 < rect.y < 100_000):
                    return {"x": rect.x, "y": rect.y, "width": rect.width, "height": rect.height}
                return None

            primary = next((bounds(menu) for menu in menus if menu.get_name() == "Agent Usage"), None)
            if primary is None:
                return []
            # Multi-monitor GNOME extensions mirror indicators without copying
            # their accessible name. The mirrored actor keeps the exact size.
            candidates = [primary]
            for menu in menus:
                candidate = bounds(menu)
                if (candidate is not None and candidate not in candidates
                        and candidate["width"] == primary["width"]
                        and candidate["height"] == primary["height"]):
                    candidates.append(candidate)
            return candidates
        except Exception:
            return []

    @staticmethod
    def pointer_position():
        """Read the XWayland pointer in the same coordinate space as AT-SPI."""
        display = None
        try:
            x11 = ctypes.CDLL("libX11.so.6")
            x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
            x11.XOpenDisplay.restype = ctypes.c_void_p
            x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
            x11.XDefaultRootWindow.restype = ctypes.c_ulong
            x11.XQueryPointer.argtypes = [
                ctypes.c_void_p, ctypes.c_ulong,
                ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong),
                ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int),
                ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int),
                ctypes.POINTER(ctypes.c_uint),
            ]
            x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
            display = x11.XOpenDisplay(None)
            if not display:
                return None
            root = x11.XDefaultRootWindow(display)
            root_return = ctypes.c_ulong()
            child_return = ctypes.c_ulong()
            root_x = ctypes.c_int()
            root_y = ctypes.c_int()
            window_x = ctypes.c_int()
            window_y = ctypes.c_int()
            mask = ctypes.c_uint()
            if not x11.XQueryPointer(
                display, root,
                ctypes.byref(root_return), ctypes.byref(child_return),
                ctypes.byref(root_x), ctypes.byref(root_y),
                ctypes.byref(window_x), ctypes.byref(window_y), ctypes.byref(mask),
            ):
                return None
            return {"x": root_x.value, "y": root_y.value}
        except Exception:
            return None
        finally:
            if display:
                x11.XCloseDisplay(display)

    def selected_indicator_bounds(self):
        candidates = self.indicator_candidates
        pointer = self.pointer_position()
        if candidates and pointer is not None:
            return min(candidates, key=lambda rect: (
                rect["x"] + rect["width"] / 2 - pointer["x"]
            ) ** 2 + (
                rect["y"] + rect["height"] / 2 - pointer["y"]
            ) ** 2)
        return candidates[0] if candidates else None

    def refresh_indicator_cache(self, repeat=False):
        candidates = self.indicator_bounds()
        if candidates:
            self.indicator_candidates = candidates
        return GLib.SOURCE_CONTINUE if repeat else GLib.SOURCE_REMOVE

    def remember_anchor(self):
        self.active_bounds = self.selected_indicator_bounds()

    def emit_action(self, event):
        selected = self.active_bounds or self.selected_indicator_bounds()
        self.emit(event, [selected] if selected else None)

    def queue_action(self, event):
        self.pending_action = event
        if self.pending_action_source:
            GLib.source_remove(self.pending_action_source)
        # A defensive fallback for menu implementations that omit the root
        # ``closed`` event. Ubuntu AppIndicator normally flushes immediately
        # through handle_menu_event when its popup has actually closed.
        self.pending_action_source = GLib.timeout_add(750, self.flush_action_timeout)

    def flush_action(self):
        source = self.pending_action_source
        self.pending_action_source = 0
        if source:
            GLib.source_remove(source)
        event = self.pending_action
        self.pending_action = None
        if event:
            self.emit_action(event)
        return GLib.SOURCE_REMOVE

    def flush_action_timeout(self):
        self.pending_action_source = 0
        return self.flush_action()

    def menu_properties(self, item_id):
        if item_id == 0:
            return {"children-display": GLib.Variant("s", "submenu")}
        if item_id in SUMMARY_IDS:
            return {
                "label": GLib.Variant("s", self.labels[item_id]),
                "enabled": GLib.Variant("b", False),
                "visible": GLib.Variant("b", self.visible.get(item_id, False)),
            }
        if item_id in (20, 23):
            return {
                "type": GLib.Variant("s", "separator"),
                "visible": GLib.Variant("b", True),
            }
        action_labels = {
            DETAIL_ID: "Detay",
            SETTINGS_ID: "Ayarlar",
            QUIT_ID: "Çıkış",
        }
        if item_id in action_labels:
            return {
                "label": GLib.Variant("s", action_labels[item_id]),
                "enabled": GLib.Variant("b", True),
                "visible": GLib.Variant("b", True),
            }
        return {}

    def menu_layout(self):
        item_ids = (*SUMMARY_IDS, 20, DETAIL_ID, SETTINGS_ID, 23, QUIT_ID)
        children = [
            GLib.Variant("(ia{sv}av)", (item_id, self.menu_properties(item_id), []))
            for item_id in item_ids
        ]
        return (0, self.menu_properties(0), children)

    def get_sni_property(self, _connection, _sender, _path, _interface, name):
        values = {
            "Category": GLib.Variant("s", "ApplicationStatus"),
            "Id": GLib.Variant("s", "agent-usage"),
            "Title": GLib.Variant("s", "Agent Usage"),
            "Status": GLib.Variant("s", "Active"),
            "WindowId": GLib.Variant("i", 0),
            "IconThemePath": GLib.Variant("s", os.path.dirname(self.icon_path)),
            "Menu": GLib.Variant("o", MENU_PATH),
            "ItemIsMenu": GLib.Variant("b", True),
            "IconName": GLib.Variant("s", self.icon_path),
            "IconPixmap": GLib.Variant("a(iiay)", []),
            "OverlayIconName": GLib.Variant("s", ""),
            "OverlayIconPixmap": GLib.Variant("a(iiay)", []),
            "AttentionIconName": GLib.Variant("s", ""),
            "AttentionIconPixmap": GLib.Variant("a(iiay)", []),
            "AttentionMovieName": GLib.Variant("s", ""),
        }
        return values[name]

    def handle_sni_method(self, _connection, _sender, _path, _interface, method, _params, invocation):
        if method == "SecondaryActivate":
            self.emit_action("detail")
        invocation.return_value(None)

    def get_menu_property(self, _connection, _sender, _path, _interface, name):
        values = {
            "Version": GLib.Variant("u", 3),
            "TextDirection": GLib.Variant("s", "ltr"),
            "Status": GLib.Variant("s", "normal"),
            "IconThemePath": GLib.Variant("as", []),
        }
        return values[name]

    def handle_menu_method(self, _connection, _sender, _path, _interface, method, params, invocation):
        unpacked = params.unpack()
        if method == "GetLayout":
            invocation.return_value(GLib.Variant("(u(ia{sv}av))", (self.revision, self.menu_layout())))
        elif method == "GetGroupProperties":
            ids, _names = unpacked
            valid_ids = (0, *SUMMARY_IDS, 20, DETAIL_ID, SETTINGS_ID, 23, QUIT_ID)
            rows = [(item_id, self.menu_properties(item_id)) for item_id in ids if item_id in valid_ids]
            invocation.return_value(GLib.Variant("(a(ia{sv}))", (rows,)))
        elif method == "GetProperty":
            item_id, name = unpacked
            value = self.menu_properties(item_id).get(name, GLib.Variant("s", ""))
            invocation.return_value(GLib.Variant("(v)", (value,)))
        elif method == "Event":
            item_id, event_id, _data, _timestamp = unpacked
            invocation.return_value(None)
            # Reply to GNOME before doing any coordinate or action work. The
            # shell must never wait on an operation that can call back into its
            # accessibility tree.
            GLib.idle_add(self.handle_menu_event, item_id, event_id)
        elif method == "EventGroup":
            invocation.return_value(GLib.Variant("(ai)", ([],)))
            for item_id, event_id, _data, _timestamp in unpacked[0]:
                GLib.idle_add(self.handle_menu_event, item_id, event_id)
        elif method == "AboutToShow":
            invocation.return_value(GLib.Variant("(b)", (False,)))
        elif method == "AboutToShowGroup":
            invocation.return_value(GLib.Variant("(aiai)", ([], [])))
        else:
            invocation.return_dbus_error("org.freedesktop.DBus.Error.UnknownMethod", method)

    def handle_menu_event(self, item_id, event_id):
        if item_id == 0 and event_id == "opened":
            self.remember_anchor()
        elif item_id == 0 and event_id == "closed":
            self.flush_action()
        elif event_id == "clicked" and item_id == DETAIL_ID:
            self.queue_action("detail")
        elif event_id == "clicked" and item_id == SETTINGS_ID:
            self.queue_action("settings")
        elif event_id == "clicked" and item_id == QUIT_ID:
            self.emit("quit")
        return GLib.SOURCE_REMOVE

    def read_update(self, stream, condition):
        if condition & (GLib.IO_HUP | GLib.IO_ERR):
            self.loop.quit()
            return GLib.SOURCE_REMOVE
        line = stream.readline()
        if not line:
            self.loop.quit()
            return GLib.SOURCE_REMOVE
        try:
            message = json.loads(line)
            labels = message.get("labels") if message.get("event") == "update" else None
            if not isinstance(labels, dict):
                return GLib.SOURCE_CONTINUE
            keys = (
                (10, "codexPro"),
                (11, "codexPlus"),
                (12, "agy"),
                (13, "zai"),
                (14, "claude"),
            )
            updated = {}
            visibility = {}
            for item_id, key in keys:
                value = labels.get(key)
                if value is None:
                    visibility[item_id] = False
                    continue
                if not isinstance(value, str) or not value.strip() or len(value) > 160:
                    return GLib.SOURCE_CONTINUE
                updated[item_id] = value.strip()
                visibility[item_id] = True
            self.labels.update(updated)
            self.visible.update(visibility)
            self.revision += 1
            if self.connection:
                self.connection.emit_signal(
                    None, MENU_PATH, "com.canonical.dbusmenu", "LayoutUpdated",
                    GLib.Variant("(ui)", (self.revision, 0)),
                )
        except (ValueError, AttributeError):
            pass
        return GLib.SOURCE_CONTINUE

    def bus_acquired(self, connection, _name):
        self.connection = connection
        sni_info = Gio.DBusNodeInfo.new_for_xml(SNI_XML).interfaces[0]
        menu_info = Gio.DBusNodeInfo.new_for_xml(MENU_XML).interfaces[0]
        connection.register_object(SNI_PATH, sni_info, self.handle_sni_method, self.get_sni_property, None)
        connection.register_object(MENU_PATH, menu_info, self.handle_menu_method, self.get_menu_property, None)

    def name_acquired(self, connection, _name):
        try:
            connection.call_sync(
                "org.kde.StatusNotifierWatcher",
                "/StatusNotifierWatcher",
                "org.kde.StatusNotifierWatcher",
                "RegisterStatusNotifierItem",
                GLib.Variant("(s)", (SNI_BUS_NAME,)),
                None,
                Gio.DBusCallFlags.NONE,
                5_000,
                None,
            )
            self.emit("ready")
            # The GNOME actor is created asynchronously after registration.
            # Populate and periodically refresh its geometry outside menu RPCs.
            GLib.timeout_add(250, self.refresh_indicator_cache, False)
            GLib.timeout_add(1_000, self.refresh_indicator_cache, False)
            GLib.timeout_add_seconds(30, self.refresh_indicator_cache, True)
        except GLib.Error as error:
            print(f"StatusNotifier kaydı başarısız: {error.message}", file=sys.stderr, flush=True)
            self.loop.quit()

    def parent_is_alive(self):
        try:
            os.kill(self.parent_pid, 0)
            return GLib.SOURCE_CONTINUE
        except OSError:
            self.loop.quit()
            return GLib.SOURCE_REMOVE

    def run(self):
        self.owner_id = Gio.bus_own_name(
            Gio.BusType.SESSION,
            SNI_BUS_NAME,
            Gio.BusNameOwnerFlags.NONE,
            self.bus_acquired,
            self.name_acquired,
            lambda *_args: self.loop.quit(),
        )
        GLib.io_add_watch(sys.stdin, GLib.IO_IN | GLib.IO_HUP | GLib.IO_ERR, self.read_update)
        GLib.timeout_add_seconds(1, self.parent_is_alive)
        self.loop.run()
        Gio.bus_unown_name(self.owner_id)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: linux-tray.py ICON_PATH PARENT_PID")

    icon_path = os.path.abspath(sys.argv[1])
    if not os.path.isfile(icon_path):
        raise SystemExit(f"tray icon does not exist: {icon_path}")

    bridge = TrayBridge(icon_path, int(sys.argv[2]))
    signal.signal(signal.SIGTERM, lambda *_args: bridge.loop.quit())
    bridge.run()


if __name__ == "__main__":
    main()
