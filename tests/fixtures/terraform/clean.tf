# Standard clean Terraform configuration
variable "instance_type" {
  type    = string
  default = "t3.medium"
}

/*
  Multi-line comment with fake resource "aws_instance" "ignored" {}
*/
resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = var.instance_type
  count         = 1

  // Inline comment
  user_data = <<-EOF
    #!/bin/bash
    echo "hello {world}"
  EOF

  root_block_device {
    volume_type = "gp3"
    volume_size = 50
    encrypted   = true
  }
}
