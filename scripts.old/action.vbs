Dim Args, param
Set Args = WScript.Arguments

param = Args(0)

Set WshShell = WScript.CreateObject("WScript.Shell")
WScript.Sleep 100

Select Case param
    Case "CH_NEXT"
        WshShell.SendKeys "{RIGHT}"
    Case "CH_PREV"
        WshShell.SendKeys "{LEFT}"
    Case "VOL_UP"
        ' WshShell.SendKeys(chr(&hAF))
        WshShell.SendKeys "{UP}"
    Case "VOL_DOWN"
        ' WshShell.SendKeys(chr(&hAE))
        WshShell.SendKeys "{DOWN}"
    Case "VOL_MUTE"
        ' WshShell.SendKeys(chr(&hAD))
        WshShell.SendKeys "m"
    Case "SHUTDOWN"
        WshShell.SendKeys "s"
        WScript.Sleep 1000
        WshShell.SendKeys "^q"
        ' WScript.Sleep 1000
        ' WshShell.Run "shutdown.exe -s -t 0"
End Select

set Args = Nothing
set WshShell = Nothing
