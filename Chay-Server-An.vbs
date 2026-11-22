Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
WshShell.CurrentDirectory = FSO.GetParentFolderName(WScript.ScriptFullName)
ConfigPath = WshShell.CurrentDirectory & "\dist\firebase-config.js"
If Not FSO.FileExists(ConfigPath) Then
  MsgBox "Thieu dist\firebase-config.js. Hay chay Chay-Server.bat sau khi sao chep cau hinh Firebase len HP.", vbCritical, "Khong the khoi dong"
  WScript.Quit 1
End If
Set ConfigFile = FSO.OpenTextFile(ConfigPath, 1)
ConfigText = ConfigFile.ReadAll
ConfigFile.Close
If InStr(ConfigText, "YOUR_API_KEY") > 0 Or InStr(ConfigText, "YOUR_PROJECT_ID") > 0 Then
  MsgBox "dist\firebase-config.js van con gia tri mau. Hay dien cau hinh Firebase that va build lai.", vbCritical, "Khong the khoi dong"
  WScript.Quit 1
End If
WshShell.Run "node server.js", 0, False
