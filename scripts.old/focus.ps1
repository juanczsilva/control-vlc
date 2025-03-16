Add-Type @"
using System;
using System.Runtime.InteropServices;
public class User32 {
	[DllImport("user32.dll")]
	[return: MarshalAs(UnmanagedType.Bool)]
	public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$hWnd = (Get-Process | Where-Object { $_.MainWindowTitle -like '*VLC*' } | Select-Object -First 1).MainWindowHandle
[void][User32]::SetForegroundWindow($hWnd)