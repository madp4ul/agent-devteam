param(
    [Parameter(Mandatory = $true)][ValidateSet('Pack', 'Unpack')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-ArchivePath([string]$Value) {
    $full = [System.IO.Path]::GetFullPath($Value)
    if ($full.StartsWith('\\?\')) { return $full }
    if ($full.StartsWith('\\')) { return '\\?\UNC\' + $full.Substring(2) }
    return '\\?\' + $full
}

$sourcePath = Get-ArchivePath $Source
$destinationPath = Get-ArchivePath $Destination
if ([System.IO.File]::Exists($destinationPath) -or [System.IO.Directory]::Exists($destinationPath)) {
    throw 'Archive destination must not already exist.'
}

if ($Mode -eq 'Pack') {
    if (-not [System.IO.Directory]::Exists($sourcePath)) { throw 'Archive source directory does not exist.' }
    [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($destinationPath))
    $stream = [System.IO.File]::Open($destinationPath, [System.IO.FileMode]::CreateNew)
    $archive = $null
    try {
        $archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
        $base = $sourcePath.TrimEnd('\')
        function Add-ArchiveDirectory([string]$Directory) {
            if (([System.IO.File]::GetAttributes($Directory) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Release archives cannot contain links or reparse points.' }
            foreach ($item in [System.IO.Directory]::EnumerateFileSystemEntries($Directory)) {
                $attributes = [System.IO.File]::GetAttributes($item)
                if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Release archives cannot contain links or reparse points.' }
                $name = $item.Substring($base.Length + 1).Replace('\', '/')
                if (($attributes -band [System.IO.FileAttributes]::Directory) -ne 0) {
                    [void]$archive.CreateEntry($name + '/')
                    Add-ArchiveDirectory $item
                } else {
                    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $item, $name, [System.IO.Compression.CompressionLevel]::Fastest)
                }
            }
        }
        Add-ArchiveDirectory $base
    } finally {
        if ($archive) { $archive.Dispose() }
        $stream.Dispose()
    }
} else {
    if (-not [System.IO.File]::Exists($sourcePath)) { throw 'Release ZIP does not exist.' }
    $archive = [System.IO.Compression.ZipFile]::OpenRead($sourcePath)
    try {
        if ($archive.Entries.Count -gt 100000) { throw 'Release ZIP has too many entries.' }
        $names = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
        $files = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
        $total = [long]0
        # Validate every entry before writing anything into the fresh destination.
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName
            $isDirectory = $name.EndsWith('/')
            if ($isDirectory) { $name = $name.Substring(0, $name.Length - 1) }
            if (-not $name -or $name.Contains('\') -or $name.Contains(':') -or $name.StartsWith('/')) { throw 'Unsafe release ZIP path.' }
            foreach ($part in $name.Split('/')) {
                if (-not $part -or $part -eq '.' -or $part -eq '..' -or $part.EndsWith('.') -or $part.EndsWith(' ') -or $part -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)' -or $part.IndexOfAny([System.IO.Path]::GetInvalidFileNameChars()) -ge 0) { throw 'Unsafe release ZIP path component.' }
            }
            $contained = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($destinationPath, $name.Replace('/', '\')))
            if (-not $contained.StartsWith($destinationPath.TrimEnd('\') + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Release ZIP path escapes its destination.' }
            if (-not $names.Add($name)) { throw 'Duplicate release ZIP path.' }
            if (-not $isDirectory) { [void]$files.Add($name) }
            $unixType = ($entry.ExternalAttributes -shr 16) -band 61440
            if ($unixType -ne 0 -and $unixType -ne 32768 -and $unixType -ne 16384) { throw 'Release ZIP links and special files are not allowed.' }
            if (($entry.ExternalAttributes -band 1024) -ne 0) { throw 'Release ZIP reparse points are not allowed.' }
            if (($unixType -eq 16384 -and -not $isDirectory) -or ($isDirectory -and $entry.Length -ne 0)) { throw 'Ambiguous release ZIP directory.' }
            $total += $entry.Length
            if ($entry.Length -lt 0 -or $total -gt 2147483648) { throw 'Release ZIP exceeds the unpacked size limit.' }
        }
        foreach ($name in $names) {
            $parts = $name.Split('/')
            for ($index = 1; $index -lt $parts.Length; $index++) {
                if ($files.Contains(($parts[0..($index - 1)] -join '/'))) { throw 'Release ZIP file and directory paths collide.' }
            }
        }
        [void][System.IO.Directory]::CreateDirectory($destinationPath)
        $written = [long]0
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName.Replace('/', '\')
            $target = [System.IO.Path]::Combine($destinationPath, $name)
            if ($entry.FullName.EndsWith('/')) {
                [void][System.IO.Directory]::CreateDirectory($target)
            } else {
                [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target))
                $inputStream = $entry.Open()
                $outputStream = [System.IO.File]::Open($target, [System.IO.FileMode]::CreateNew)
                try {
                    $buffer = New-Object byte[] 65536
                    $entryWritten = [long]0
                    while (($count = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                        $entryWritten += $count
                        $written += $count
                        if ($entryWritten -gt $entry.Length -or $written -gt 2147483648) { throw 'Release ZIP exceeds its declared or allowed size.' }
                        $outputStream.Write($buffer, 0, $count)
                    }
                } finally { $outputStream.Dispose(); $inputStream.Dispose() }
                if ((New-Object System.IO.FileInfo($target)).Length -ne $entry.Length) { throw 'Release ZIP entry length mismatch.' }
            }
        }
    } finally { $archive.Dispose() }
}
