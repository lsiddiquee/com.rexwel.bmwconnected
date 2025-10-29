import json
import argparse
import re

def process_log_file(file_path):
    # Initialize dictionary to store unique keys and their corresponding values list
    data_dict = {}
    # Open the file and read line by line
    with open(file_path, 'r') as file:
        for line in file:
            try:
                # Extract JSON part from the log line using regex
                match = re.search(r'DEBUG: State updated from MQTT (\{.*\})', line)
                if not match:
                    continue

                # Parse the JSON object from the extracted part
                json_obj = json.loads(match.group(1))

                # Navigate to the "data" field in the JSON object
                data = json_obj.get("message", {}).get("data", {})

                # Iterate through the "data" field
                for key, value_obj in data.items():
                    if key not in data_dict:
                        data_dict[key] = []
                    data_dict[key].append(value_obj)
            except (json.JSONDecodeError, KeyError) as e:
                print(f"Error processing line: {e}")
                continue

    return data_dict

# Parse command-line arguments
parser = argparse.ArgumentParser(description='Process a JSON log file to extract unique telematic values.')
parser.add_argument('input_file_path', type=str, help='Path to the input log file')
parser.add_argument('output_file_path', type=str, help='Path to the output JSON file')
args = parser.parse_args()

# Specify the input and output file paths from arguments
input_file_path = args.input_file_path
output_file_path = args.output_file_path

# Process the file to get the dictionary of unique keys and values list
if input_file_path.endswith('.json'):
    with open(input_file_path, 'r') as f:
        result_dict = json.load(f)
else:
    result_dict = process_log_file(input_file_path)

# If output file exists, merge with its contents
try:
    with open(output_file_path, 'r') as f:
        existing_dict = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    existing_dict = {}



# Merge and deduplicate by value only (not timestamp)
for key, value_list in result_dict.items():
    if key not in existing_dict:
        merged = value_list
    else:
        merged = existing_dict[key] + value_list
    # Deduplicate: keep only one item per unique value (keep the first occurrence)
    deduped = {}
    for item in merged:
        value_repr = json.dumps(item.get('value', None), sort_keys=True)
        if value_repr not in deduped:
            deduped[value_repr] = item
    existing_dict[key] = list(deduped.values())

# Sort the keys and sort each value list by timestamp
sorted_dict = {}
for key in sorted(existing_dict.keys()):
    value_list = existing_dict[key]
    # Only sort if items have a timestamp
    if value_list and isinstance(value_list, list) and 'timestamp' in value_list[0]:
        value_list = sorted(value_list, key=lambda x: x.get('timestamp', ''))
    sorted_dict[key] = value_list

# Write the merged and sorted result to the output file
with open(output_file_path, 'w') as f:
    json.dump(sorted_dict, f, indent=4, sort_keys=True)

# Also print to stdout for convenience
print(json.dumps(sorted_dict, indent=4, sort_keys=True))
