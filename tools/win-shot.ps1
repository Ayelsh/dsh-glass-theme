# Capture the real DSH Desktop window (not a headless browser) so that native
# chrome — the Windows title-bar overlay, the caption buttons, the real theme
# resolution — is included in the screenshot.
#
#   pwsh -File tools/win-shot.ps1 -Out G:\dsh-build\research\win.png
#
# PrintWindow with PW_RENDERFULLCONTENT (2) captures GPU-composited Electron
# content; a plain CopyFromScreen would only get what is not occluded.
param(
  [string]$Out = 'G:\dsh-build\research\win.png',
  [string]$Match = 'DeepSeek'
)

Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@

$proc = Get-Process |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -match $Match } |
  Select-Object -First 1
if (-not $proc) {
  $proc = Get-Process |
    Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match 'DeepSeek' } |
    Select-Object -First 1
}
if (-not $proc) { Write-Error 'no visible DSH window found'; exit 1 }

$h = $proc.MainWindowHandle
[void][Win]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 400

# DwmGetWindowAttribute(9 = DWMWA_EXTENDED_FRAME_BOUNDS) excludes the invisible
# resize border that GetWindowRect includes, so the bitmap matches what the eye
# sees.
$r = New-Object Win+RECT
$ok = [Win]::DwmGetWindowAttribute($h, 9, [ref]$r, 16)
if ($ok -ne 0) { [void][Win]::GetWindowRect($h, [ref]$r) }

$w = $r.Right - $r.Left
$hh = $r.Bottom - $r.Top
Write-Output ("window '{0}' pid {1} {2}x{3} at {4},{5}" -f $proc.MainWindowTitle, $proc.Id, $w, $hh, $r.Left, $r.Top)

$bmp = New-Object System.Drawing.Bitmap($w, $hh)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$dc = $g.GetHdc()
# 2 = PW_RENDERFULLCONTENT, required for DirectComposition surfaces.
$ok = [Win]::PrintWindow($h, $dc, 2)
$g.ReleaseHdc($dc)
$g.Dispose()

if (-not $ok) { Write-Warning 'PrintWindow returned false; the image may be blank' }
$dir = Split-Path -Parent $Out
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output ("shot: {0} ({1} bytes)" -f $Out, (Get-Item $Out).Length)
