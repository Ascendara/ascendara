# This script counts the number of lines of code used in Ascendara, including
# all files in the src, electron, binaries, scripts, and tests directories. It excludes
# any whitespace lines (lines that are just indented) by default.

# View the results of the latest count in 'lineCountResult.txt'.

import os

def count_lines_in_file(filepath):
    """Count non-empty lines in a file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as file:
            # Read lines and filter out whitespace-only lines
            lines = [line.strip() for line in file if line.strip()]
            return len(lines)
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
        return 0

def main():
    # File extensions to look for
    target_extensions = ('.js', '.jsx', '.css', '.html', '.py', '.rs', '.ts')
    
    # Target directories
    target_directories = ['src', 'electron', 'binaries', 'scripts', 'tests']
    
    # Directories to exclude when walking
    excluded_dirs = {
        'node_modules',
        'build',
        'dist',
        'target',
        '__pycache__',
        'debian',
        'concept',
        'assets',
        '.git',
        '.cache',
    }
    
    # Specific outdated/generated/ignored files to exclude
    excluded_files = {
        'AscendaraDownloader_OLD.py',
        'AscendaraDownloaderV1.py',
        'AscendaraLocalRefresh_old.py',
        'appOrginal.js',
        'config.prod.js',
        'upload.py',
        'webview-api.py',
    }
    
    # Initialize counters
    total_lines = 0
    file_counts = {ext: 0 for ext in target_extensions}
    line_counts = {ext: 0 for ext in target_extensions}
    dir_counts = {dir_name: 0 for dir_name in target_directories}
    
    # Get the project root directory (one level up from scripts)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)  # Go up one directory
    
    # Process each target directory
    for target_dir in target_directories:
        dir_path = os.path.join(project_root, target_dir)
        if not os.path.exists(dir_path):
            print(f"Warning: Directory '{target_dir}' not found")
            continue
            
        print(f"\nProcessing directory: {target_dir}")
        dir_line_count = 0
        
        # Walk through directory
        for root, dirs, files in os.walk(dir_path):
            # Prune excluded directories in-place so os.walk doesn't descend into them
            dirs[:] = [d for d in dirs if d.lower() not in excluded_dirs]
            
            for file in files:
                if file in excluded_files:
                    continue
                if target_dir == 'electron' and file == 'index.html':
                    continue
                    
                ext = os.path.splitext(file)[1].lower()
                if ext in target_extensions:
                    filepath = os.path.join(root, file)
                    lines = count_lines_in_file(filepath)
                    total_lines += lines
                    dir_line_count += lines
                    file_counts[ext] += 1
                    line_counts[ext] += lines
        
        dir_counts[target_dir] = dir_line_count
    
    # Format results
    summary_lines = [
        "Code Line Count Summary:",
        "-" * 50,
    ]
    for ext in target_extensions:
        if file_counts[ext] > 0:
            summary_lines.append(f"{ext[1:]:>4} files: {file_counts[ext]:>5} files, {line_counts[ext]:>6} lines")
    
    summary_lines.extend([
        "",
        "Lines by Directory:",
        "-" * 50,
    ])
    for dir_name, count in dir_counts.items():
        summary_lines.append(f"{dir_name:>9}: {count:>6} lines")
    
    summary_lines.extend([
        "",
        "Total Summary:",
        "-" * 50,
        f"Total: {sum(file_counts.values()):>5} files, {total_lines:>6} lines",
    ])
    
    output_text = "\n".join(summary_lines)
    print("\n" + output_text)
    
    result_path = os.path.join(script_dir, 'lineCountResult.txt')
    with open(result_path, 'w', encoding='utf-8') as result_file:
        result_file.write(output_text + "\n")

if __name__ == "__main__":
    main()
