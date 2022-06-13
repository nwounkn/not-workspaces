# not-workspaces
GNOME Shell extension for quickly switching between windows' positions

## Usage
- Apply state `<state_name>`:  
`dbus-send --type=method_call --dest=org.gnome.Shell /com/github/nwounkn/notworkspaces com.github.nwounkn.notworkspaces.apply string:'<state_name>'`
- Save state `<state_name>`:  
`dbus-send --type=method_call --dest=org.gnome.Shell /com/github/nwounkn/notworkspaces com.github.nwounkn.notworkspaces.save string:'<state_name>'`
- Save the current state and apply state `<state_name>`:  
`dbus-send --type=method_call --dest=org.gnome.Shell /com/github/nwounkn/notworkspaces com.github.nwounkn.notworkspaces.switchTo string:'<state_name>'`
- Add/remove active window from the current state:  
`dbus-send --type=method_call --dest=org.gnome.Shell /com/github/nwounkn/notworkspaces com.github.nwounkn.notworkspaces.toggleActiveWindow`
- Activate next window in the current state:  
`dbus-send --type=method_call --dest=org.gnome.Shell /com/github/nwounkn/notworkspaces com.github.nwounkn.notworkspaces.nextWindow int32:1`
- Apply next state that has the active window:  
`dbus-send --type=method_call --dest=org.gnome.Shell /com/github/nwounkn/notworkspaces com.github.nwounkn.notworkspaces.nextState int32:1`
