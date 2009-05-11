#!/usr/bin/env ruby

require 'tempfile'
require 'google_chart'
require "httpclient"
require "rexml/document"
require "rexml/xpath"
require "json"
require "time"
require "fileutils"

def call(method, parameters = '', &block)
  puts "Calling #{method}?#{parameters}"
  response = HTTPClient.new.get("http://smartbikeportal.clearchannel.no/public/mobapp/maq.asmx/#{method}?#{parameters}")
  doc = REXML::Document.new(response.body.content)
  REXML::XPath.each(doc, "/string") do |element|
    yield REXML::Document.new("<result>#{element.text}</result>")
  end
end

def graph_url_for(id)
  stats = {}
  Dir.glob("archive/*.json").each do |file_name|
    stations = JSON.parse(File.read(file_name))
    stations.each do |descriptor|
      if descriptor["id"] == id
        stats[Time.parse(descriptor["updatedAt"])] = {
          :full => descriptor["readyCount"] && descriptor["emptyCount"] ? 
            (descriptor["readyCount"] / (descriptor["emptyCount"] + descriptor["readyCount"].to_f)) : 0,
          :online => descriptor["online"]
        }
       end
    end
  end
  entries = stats.entries.sort_by { |(time, x)| time }
  if entries.length > 0    
    max_entries = 50
    if entries.length > max_entries
      entries = entries[entries.length - max_entries, max_entries]
    end
    labels = entries.map { |time, x| time }
    values = entries.map { |time, x| (x[:full] * 100).floor rescue nil }.compact
    unless values.empty?
      p values
      labels.each_with_index do |label, index|
        if index % 5 == 0
          labels[index] = label.strftime('%H:%M')
        else
          labels[index] = ''
        end
      end
      labels[0] = ''
      graph_url = nil
      GoogleChart::LineChart.new('400x150', nil, false) do |lc|
        lc.show_legend = false
        lc.data "Sykler", values, "666666"
        lc.line_style 0, :line_thickness => 3
        #lc.fill_area "c5e0ff", 0, 0
        lc.max_value values.max + 10
        lc.axis :y, :color => '888888', :font_size => 8, :range => [0, values.max + 10]
        lc.axis :x, :color => '888888', :font_size => 8, :labels => labels
        graph_url = lc.to_url 
        #graph_url << "&chma=0,0,5,0"
      end
      puts graph_url
      return graph_url
    end
  end
  return nil
end

def write_file(file_name, data)
  temp_name = "#{file_name}.new"
  File.open(temp_name, "w") do |file|
    file << data
  end
  FileUtils.mv(temp_name, file_name)
end

stations = {}
input = JSON.parse(File.read("stations.json"))
input.each do |station|
  id = station["id"]
  stations[id] = station
end
p stations
loop do
  call("getRacks") do |doc|
    REXML::XPath.each(doc, "//station") do |element|
      id = element.text
      call("getRack", "id=#{id}") do |doc2|
        station = {}
        REXML::XPath.each(doc2, "//station/description") do |element|
          station[:description] = element.text.gsub(/^\d+\-(.*)/, '\1').strip
        end
        REXML::XPath.each(doc2, "//station/longitute") do |element|
          station[:longitude] = element.text.to_f
        end
        REXML::XPath.each(doc2, "//station/latitude") do |element|
          station[:latitude] = element.text.to_f
        end
        REXML::XPath.each(doc2, "//station/ready_bikes") do |element|
          station[:readyCount] = element.text.to_i
        end
        REXML::XPath.each(doc2, "//station/empty_locks") do |element|
          station[:emptyCount] = element.text.to_i
        end
        REXML::XPath.each(doc2, "//station/online") do |element|
          station[:online] = element.text == "1"
        end
        unless station.empty?
          station[:id] = id
          station[:updatedAt] = Time.now.rfc2822
          station[:graphUrl] = graph_url_for(id)
          stations[id] = station
          write_file("stations.json", stations.values.to_json)
          sleep(3)
        end
      end
    end
  end
  FileUtils.mkdir_p("archive")
  File.open("archive/#{Time.now.strftime('%Y%m%d-%H%M%S')}.json", "w") do |file|
    file << stations.values.to_json
  end
  sleep(10)
end
